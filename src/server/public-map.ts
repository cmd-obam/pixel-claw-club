import { z } from "zod";
import { AppError } from "@/domain/errors";
import { haversineMeters } from "@/domain/stores";
import { buildIlikeOr, looksLikePlaceName, MAP_SEARCH_PAGE_SIZE, resolveSearchArea, textMatchesStoreQuery, type SearchArea } from "@/domain/map-search";
import { classifyStoreKind, clusterMapPoints, type ClawPresence, type StoreKind } from "@/domain/public-stores";
import type { MapPlaceView } from "@/server/engine/queries";
import { geocodePlaceName, naverLocalSearchStatus } from "@/server/place-geocode";
import { requireActor } from "@/server/session";
import { createSupabaseAdmin } from "@/server/supabase/admin";
import { createSupabaseServer, safeDatabaseMessage } from "@/server/supabase/server";

const NEARBY_METERS = 3000;

const rowSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  business_status: z.string(),
  detail_status: z.string(),
  classification: z.enum(["related", "uncertain"]),
  region_name: z.string(),
  data_as_of: z.string().nullable(),
  source: z.string().optional(),
  store_kind: z.enum(["CLAW", "ARCADE", "UNKNOWN"]).nullable().optional(),
  claw_presence: z.enum(["YES", "NO", "UNKNOWN"]).nullable().optional(),
  classification_reason: z.string().nullable().optional(),
  verified_at: z.string().nullable().optional(),
});

export interface PublicStoreDetail {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  businessStatus: string;
  detailStatus: string;
  regionName: string;
  dataAsOf: string | null;
  classification: "related" | "uncertain";
  source: string;
  storeKind: StoreKind;
  clawPresence: ClawPresence;
  classificationReason: string;
  verifiedAt: string | null;
}

export async function loadPublicMapLayer(input: {
  south: number;
  west: number;
  north: number;
  east: number;
  zoom: number;
  query: string;
  nearLat: number | null;
  nearLng: number | null;
  kind: StoreKind | null;
}): Promise<MapPlaceView[]> {
  await requireActor();
  const supabase = await createSupabaseServer();
  const text = input.query.replace(/[%_,.()]/g, " ").trim().slice(0, 40);
  const rows = await readPublicRows(supabase, input, text);
  const located = rows.flatMap((row) => {
    if (row.latitude === null || row.longitude === null) {
      return [];
    }
    const decision = classifyStoreKind(row.name);
    const storeKind = row.store_kind ?? decision.kind;
    const clawPresence = row.claw_presence ?? decision.clawPresence;
    if (input.kind && storeKind !== input.kind) {
      return [];
    }
    return [{ ...row, latitude: row.latitude, longitude: row.longitude, storeKind, clawPresence }];
  });
  const nearby = input.nearLat !== null && input.nearLng !== null && text.length < 2
    ? located.filter((row) => haversineMeters(input.nearLat as number, input.nearLng as number, row.latitude, row.longitude) <= NEARBY_METERS)
    : located;
  const zoom = nearby.length > 400 ? Math.min(input.zoom, 13) : input.zoom;
  const points = nearby.map((row) => ({
    id: row.id,
    name: row.name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    storeKind: row.storeKind,
    clawPresence: row.clawPresence,
  }));
  const clustered = text.length >= 2
    ? points.map((point) => ({ ...point, clusterCount: 1 }))
    : clusterMapPoints(points, zoom);
  const presenceById = new Map(points.map((point) => [point.id, point.clawPresence]));
  return clustered.map((row) => ({
    id: row.id,
    name: row.name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    revenge: false,
    visited: false,
    visitCount: 0,
    winCount: 0,
    failCount: 0,
    spendingLabel: row.clusterCount > 1 ? `${kindLabel(row.storeKind)} ${row.clusterCount}곳` : kindLabel(row.storeKind),
    origin: "public" as const,
    clusterCount: row.clusterCount,
    storeKind: row.storeKind,
    clawPresence: presenceById.get(row.id) ?? "UNKNOWN",
  }));
}

const BASE_COLUMNS = "id,name,address,latitude,longitude,business_status,detail_status,classification,region_name,data_as_of,source";
const KIND_COLUMNS = `${BASE_COLUMNS},store_kind,claw_presence,classification_reason,verified_at`;

async function readPublicRows(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  input: { south: number; west: number; north: number; east: number },
  text: string,
) {
  const loadPage = async (columns: string, from: number, size: number) => {
    let request = supabase
      .from("public_stores")
      .select(columns)
      .eq("business_status", "영업/정상")
      .not("latitude", "is", null)
      .not("longitude", "is", null);
    if (text.length >= 2) {
      request = request.or(`name.ilike.%${text}%,address.ilike.%${text}%`);
    } else {
      request = request
        .gte("latitude", input.south)
        .lte("latitude", input.north)
        .gte("longitude", input.west)
        .lte("longitude", input.east);
    }
    return request.range(from, from + size - 1);
  };
  let columns = KIND_COLUMNS;
  const probe = await loadPage(columns, 0, 1);
  if (probe.error && /store_kind|claw_presence/.test(probe.error.message)) {
    columns = BASE_COLUMNS;
  } else if (probe.error) {
    if (probe.error.code === "PGRST205" || probe.error.message.includes("schema cache") || probe.error.message.includes("does not exist")) {
      return [];
    }
    throw new AppError("DATABASE", safeDatabaseMessage(probe.error.message));
  }
  const pageSize = text.length >= 2 ? 40 : 1000;
  const rows = [];
  for (let from = 0; from < 20000; from += pageSize) {
    const page = await loadPage(columns, from, pageSize);
    if (page.error) {
      throw new AppError("DATABASE", safeDatabaseMessage(page.error.message));
    }
    const parsed = z.array(rowSchema).parse(page.data ?? []);
    rows.push(...parsed);
    if (parsed.length < pageSize) {
      break;
    }
  }
  return rows;
}

function kindLabel(kind: StoreKind): string {
  if (kind === "CLAW") return "인형뽑기 전문점";
  if (kind === "ARCADE") return "일반 오락실";
  return "유형 미확인";
}

export async function loadPublicStore(id: string): Promise<PublicStoreDetail | null> {
  await requireActor();
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) {
    return null;
  }
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("public_stores")
    .select(KIND_COLUMNS)
    .eq("id", parsed.data)
    .maybeSingle();
  if (error && /store_kind|claw_presence/.test(error.message)) {
    const fallback = await supabase
      .from("public_stores")
      .select(BASE_COLUMNS)
      .eq("id", parsed.data)
      .maybeSingle();
    if (fallback.error) {
      throw new AppError("DATABASE", safeDatabaseMessage(fallback.error.message));
    }
    return toDetail(rowSchema.nullable().parse(fallback.data));
  }
  if (error) {
    throw new AppError("DATABASE", safeDatabaseMessage(error.message));
  }
  return toDetail(rowSchema.nullable().parse(data));
}

function toDetail(row: z.infer<typeof rowSchema> | null): PublicStoreDetail | null {
  if (!row) {
    return null;
  }
  const decision = classifyStoreKind(row.name);
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    businessStatus: row.business_status,
    detailStatus: row.detail_status,
    regionName: row.region_name,
    dataAsOf: row.data_as_of,
    classification: row.classification,
    source: row.source ?? "",
    storeKind: row.store_kind ?? decision.kind,
    clawPresence: row.claw_presence ?? decision.clawPresence,
    classificationReason: row.classification_reason || decision.reason,
    verifiedAt: row.verified_at ?? null,
  };
}

export async function adoptPublicStore(publicStoreId: string): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const actor = await requireActor();
  if (actor.mode === "demo") {
    return { ok: false, message: "연습 모드에서는 공공 매장을 기록에 연결하지 않습니다." };
  }
  const store = await loadPublicStore(publicStoreId);
  if (!store) {
    return { ok: false, message: "연결할 공공 매장을 찾지 못했습니다." };
  }
  const supabase = await createSupabaseServer();
  const { data: membership, error: memberError } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", actor.id)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (memberError || !membership || typeof membership.group_id !== "string") {
    return { ok: false, message: "그룹에 참여한 뒤 매장을 연결할 수 있습니다." };
  }
  const { data: existing, error: existingError } = await supabase
    .from("stores")
    .select("id")
    .eq("group_id", membership.group_id)
    .eq("public_store_id", store.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (existingError) {
    return { ok: false, message: "매장 연결 정보를 확인하지 못했습니다." };
  }
  if (existing && typeof existing.id === "string") {
    return { ok: true, id: existing.id };
  }
  const name = store.name.trim().slice(0, 80);
  const { data, error } = await supabase
    .from("stores")
    .insert({
      group_id: membership.group_id,
      name,
      address: store.address,
      latitude: store.latitude,
      longitude: store.longitude,
      notes: "지방행정 인허가 데이터에서 연결한 매장입니다. 기존에 직접 등록한 매장은 바꾸지 않습니다.",
      created_by: actor.id,
      public_store_id: store.id,
    })
    .select("id")
    .single();
  if (error) {
    return { ok: false, message: "이 매장을 기록용 매장으로 연결하지 못했습니다." };
  }
  return { ok: true, id: z.object({ id: z.string() }).parse(data).id };
}

export async function confirmPublicStore(input: {
  id: string;
  kind: StoreKind;
  clawPresence: ClawPresence;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const actor = await requireActor();
  if (actor.mode === "demo") {
    return { ok: false, message: "연습 모드에서는 매장 분류를 저장하지 않습니다." };
  }
  const parsedId = z.string().uuid().safeParse(input.id);
  if (!parsedId.success || !["CLAW", "ARCADE", "UNKNOWN"].includes(input.kind) || !["YES", "NO", "UNKNOWN"].includes(input.clawPresence)) {
    return { ok: false, message: "분류 값을 확인해 주세요." };
  }
  const supabase = await createSupabaseServer();
  const { data: membership, error: memberError } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", actor.id)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (memberError || !membership) {
    return { ok: false, message: "그룹에 참여한 회원만 분류를 수정할 수 있습니다." };
  }
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("public_stores")
    .update({
      store_kind: input.kind,
      claw_presence: input.clawPresence,
      classification_reason: "회원이 직접 확인",
      classification_confidence: "high",
      verified_by: actor.id,
      verified_at: new Date().toISOString(),
    })
    .eq("id", parsedId.data)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return { ok: false, message: "분류를 저장하지 못했습니다. 매장 분류 항목이 데이터베이스에 준비됐는지 확인해 주세요." };
  }
  return { ok: true };
}

export interface PublicSearchResult {
  status: "ok" | "empty" | "error";
  message: string;
  area: SearchArea | null;
  places: MapPlaceView[];
  nearby: MapPlaceView[];
  hasMore: boolean;
}

export async function searchPublicStores(input: {
  query: string;
  kind: StoreKind | null;
  offset: number;
}): Promise<PublicSearchResult> {
  await requireActor();
  const text = input.query.trim().slice(0, 40);
  const offset = Number.isFinite(input.offset) ? Math.max(0, Math.min(45, Math.floor(input.offset))) : 0;
  if (queryTooShort(text)) {
    return { status: "empty", message: "두 글자 이상 입력해 주세요.", area: null, places: [], nearby: [], hasMore: false };
  }
  const supabase = await createSupabaseServer();
  const known = resolveSearchArea(text);
  const area = known ?? (looksLikePlaceName(text) ? await geocodedArea(text) : null);
  const [places, nearby] = await Promise.all([
    searchByName(supabase, text, input.kind, offset, !known),
    area ? searchNearArea(supabase, area, input.kind) : Promise.resolve([]),
  ]);
  const named = places.rows;
  const around = nearby.filter((place) => !named.some((item) => item.id === place.id));
  const empty = named.length === 0 && around.length === 0 && !area;
  let message = "";
  if (area && around.length === 0) {
    message = `${area.label} 주변에서 표시할 매장을 찾지 못했습니다.`;
  } else if (empty && looksLikePlaceName(text) && naverLocalSearchStatus() === "unavailable") {
    message = "지역 좌표 API를 사용할 수 없어, 저장된 주소와 매장명만 검색했습니다.";
  } else if (empty) {
    message = "일치하는 매장이 없습니다.";
  }
  return {
    status: empty ? "empty" : "ok",
    message,
    area,
    places: named,
    nearby: around,
    hasMore: places.hasMore,
  };
}

function queryTooShort(text: string): boolean {
  return text.replace(/\s+/g, "").length < 2;
}

async function geocodedArea(text: string): Promise<SearchArea | null> {
  const place = await geocodePlaceName(text);
  if (!place) {
    return null;
  }
  return { label: place.label, latitude: place.latitude, longitude: place.longitude, zoom: 16, radiusMeters: 1200 };
}

async function searchByName(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  text: string,
  kind: StoreKind | null,
  offset: number,
  includeAddress: boolean,
): Promise<{ rows: MapPlaceView[]; hasMore: boolean }> {
  const filter = buildIlikeOr(text, includeAddress ? ["name", "address"] : ["name"]);
  if (!filter) {
    return { rows: [], hasMore: false };
  }
  const columns = await usableColumns(supabase);
  let request = supabase.from("public_stores").select(columns).eq("business_status", "영업/정상").or(filter).order("name").limit(80);
  if (kind && columns.includes("store_kind")) {
    request = request.eq("store_kind", kind);
  }
  const { data, error } = await request;
  if (error) {
    throw new AppError("DATABASE", safeDatabaseMessage(error.message));
  }
  const matched = z.array(rowSchema).parse(data ?? []).flatMap((row) => {
    if (!textMatchesStoreQuery(row.name, includeAddress ? row.address : "", text)) {
      return [];
    }
    const view = toMapPlace(row);
    if (kind && view.storeKind !== kind) {
      return [];
    }
    return [view];
  });
  return { rows: matched.slice(offset, offset + MAP_SEARCH_PAGE_SIZE), hasMore: matched.length > offset + MAP_SEARCH_PAGE_SIZE };
}

async function searchNearArea(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  area: SearchArea,
  kind: StoreKind | null,
): Promise<MapPlaceView[]> {
  const latDelta = area.radiusMeters / 111_000;
  const lngDelta = area.radiusMeters / (111_000 * Math.cos((area.latitude * Math.PI) / 180));
  const columns = await usableColumns(supabase);
  let request = supabase
    .from("public_stores")
    .select(columns)
    .eq("business_status", "영업/정상")
    .not("latitude", "is", null)
    .gte("latitude", area.latitude - latDelta)
    .lte("latitude", area.latitude + latDelta)
    .gte("longitude", area.longitude - lngDelta)
    .lte("longitude", area.longitude + lngDelta)
    .limit(300);
  if (kind && columns.includes("store_kind")) {
    request = request.eq("store_kind", kind);
  }
  const { data, error } = await request;
  if (error) {
    throw new AppError("DATABASE", safeDatabaseMessage(error.message));
  }
  return z
    .array(rowSchema)
    .parse(data ?? [])
    .flatMap((row) => {
      if (row.latitude === null || row.longitude === null) {
        return [];
      }
      if (haversineMeters(area.latitude, area.longitude, row.latitude, row.longitude) > area.radiusMeters) {
        return [];
      }
      const view = toMapPlace(row);
      if (kind && view.storeKind !== kind) {
        return [];
      }
      return [{ view, distance: haversineMeters(area.latitude, area.longitude, row.latitude, row.longitude) }];
    })
    .sort((left, right) => left.distance - right.distance)
    .slice(0, MAP_SEARCH_PAGE_SIZE)
    .map((item) => item.view);
}

let columnChoice: string | null = null;

async function usableColumns(supabase: Awaited<ReturnType<typeof createSupabaseServer>>): Promise<string> {
  if (columnChoice) {
    return columnChoice;
  }
  const probe = await supabase.from("public_stores").select(KIND_COLUMNS).limit(1);
  columnChoice = probe.error && /store_kind|claw_presence/.test(probe.error.message) ? BASE_COLUMNS : KIND_COLUMNS;
  if (probe.error && columnChoice === KIND_COLUMNS) {
    throw new AppError("DATABASE", safeDatabaseMessage(probe.error.message));
  }
  return columnChoice;
}

function toMapPlace(row: z.infer<typeof rowSchema>): MapPlaceView {
  const decision = classifyStoreKind(row.name);
  const storeKind = row.store_kind ?? decision.kind;
  const clawPresence = row.claw_presence ?? decision.clawPresence;
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    revenge: false,
    visited: false,
    visitCount: 0,
    winCount: 0,
    failCount: 0,
    spendingLabel: kindLabel(storeKind),
    origin: "public",
    clusterCount: 1,
    storeKind,
    clawPresence,
  };
}
