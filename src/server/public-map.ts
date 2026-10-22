import { z } from "zod";
import { AppError } from "@/domain/errors";
import { haversineMeters } from "@/domain/stores";
import { clusterMapPoints } from "@/domain/public-stores";
import type { MapPlaceView } from "@/server/engine/queries";
import { requireActor } from "@/server/session";
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
}): Promise<MapPlaceView[]> {
  await requireActor();
  const supabase = await createSupabaseServer();
  const text = input.query.replace(/[%_,.()]/g, " ").trim().slice(0, 40);
  let request = supabase
    .from("public_stores")
    .select("id,name,address,latitude,longitude,business_status,detail_status,classification,region_name,data_as_of")
    .eq("classification", "related")
    .eq("business_status", "영업/정상")
    .not("latitude", "is", null)
    .not("longitude", "is", null);
  if (text.length >= 2) {
    request = request.or(`name.ilike.%${text}%,address.ilike.%${text}%`).limit(40);
  } else {
    request = request
      .gte("latitude", input.south)
      .lte("latitude", input.north)
      .gte("longitude", input.west)
      .lte("longitude", input.east)
      .limit(2000);
  }
  const { data, error } = await request;
  if (error) {
    if (error.code === "PGRST205" || error.message.includes("schema cache") || error.message.includes("does not exist")) {
      return [];
    }
    throw new AppError("DATABASE", safeDatabaseMessage(error.message));
  }
  let rows = z.array(rowSchema).parse(data ?? []).flatMap((row) => {
    if (row.latitude === null || row.longitude === null) {
      return [];
    }
    return [{ ...row, latitude: row.latitude, longitude: row.longitude }];
  });
  if (input.nearLat !== null && input.nearLng !== null && text.length < 2) {
    rows = rows.filter(
      (row) => haversineMeters(input.nearLat as number, input.nearLng as number, row.latitude, row.longitude) <= NEARBY_METERS,
    );
  }
  const zoom = rows.length > 400 ? Math.min(input.zoom, 13) : input.zoom;
  const clustered = text.length >= 2 ? rows.map((row) => ({ ...row, clusterCount: 1 })) : clusterMapPoints(rows, zoom).map((point) => ({
    ...point,
    business_status: "영업/정상",
    detail_status: "",
    classification: "related" as const,
    region_name: "",
    data_as_of: null,
  }));
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
    spendingLabel: row.clusterCount > 1 ? "이 구역의 인허가 매장" : "인허가 정보 · 영업중",
    origin: "public" as const,
    clusterCount: row.clusterCount,
  }));
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
    .select("id,name,address,latitude,longitude,business_status,detail_status,classification,region_name,data_as_of")
    .eq("id", parsed.data)
    .maybeSingle();
  if (error) {
    throw new AppError("DATABASE", safeDatabaseMessage(error.message));
  }
  const row = rowSchema.nullable().parse(data);
  if (!row) {
    return null;
  }
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
  };
}

export async function adoptPublicStore(publicStoreId: string): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const actor = await requireActor();
  if (actor.mode === "demo") {
    return { ok: false, message: "연습 모드에서는 공공 매장을 기록에 연결하지 않습니다." };
  }
  const store = await loadPublicStore(publicStoreId);
  if (!store || store.classification !== "related") {
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
