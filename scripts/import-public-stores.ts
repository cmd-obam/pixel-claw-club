import fs from "node:fs";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";
import {
  PUBLIC_STORE_SOURCE,
  classifyYouthGameStore,
  isKoreanCoordinate,
  normalizeStoreKey,
  regionFromAddress,
} from "../src/domain/public-stores.ts";

const require = createRequire(import.meta.url);
const proj4 = require("proj4") as {
  defs: (name: string, definition: string) => void;
  (from: string, to: string, coordinate: [number, number]): [number, number];
};

proj4.defs(
  "EPSG:5174",
  "+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43 +units=m +no_defs",
);

const CSV_PATH = "tmp-public-data/youth.zip";
const OPEN_STATUS = "영업/정상";
const OPEN_DETAIL = "영업중";

interface PreparedStore {
  source: string;
  source_id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  business_status: string;
  detail_status: string;
  classification: "related" | "uncertain";
  region_name: string;
  source_updated_at: string | null;
  data_as_of: string;
}

function loadEnvFile(): void {
  if (!fs.existsSync(".env.local")) {
    return;
  }
  const text = fs.readFileSync(".env.local", "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const splitAt = trimmed.indexOf("=");
    const key = trimmed.slice(0, splitAt).trim();
    let value = trimmed.slice(splitAt + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(current);
      current = "";
    } else if (char === "\n") {
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
    } else if (char !== "\r") {
      current += char;
    }
  }
  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }
  return rows;
}

function toWgs84(xText: string, yText: string): { latitude: number; longitude: number } | null {
  const x = Number(xText);
  const y = Number(yText);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x === 0 || y === 0) {
    return null;
  }
  const [longitude, latitude] = proj4("EPSG:5174", "WGS84", [x, y]);
  if (!isKoreanCoordinate(latitude, longitude)) {
    return null;
  }
  return { latitude: Number(latitude.toFixed(7)), longitude: Number(longitude.toFixed(7)) };
}

function parseTimestamp(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = new Date(trimmed.replace(" ", "T") + "+09:00");
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const earth = 6_371_000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function geocodeMissing(stores: PreparedStore[]): Promise<{ filled: number; stillMissing: number; attempted: boolean; stoppedAtStatus?: number }> {
  const id = process.env.NAVER_SEARCH_CLIENT_ID ?? "";
  const secret = process.env.NAVER_SEARCH_CLIENT_SECRET ?? "";
  const targets = stores.filter((store) => store.classification === "related" && store.latitude === null && store.address.length > 4);
  if (!id || !secret || targets.length === 0) {
    return {
      filled: 0,
      stillMissing: stores.filter((store) => store.classification === "related" && store.latitude === null).length,
      attempted: false,
    };
  }
  let filled = 0;
  for (const store of targets) {
    const query = `${store.name} ${store.address}`.slice(0, 80);
    const response = await fetch(`https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=1`, {
      headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
    });
    if (!response.ok) {
      return {
        filled,
        stillMissing: stores.filter((store) => store.classification === "related" && store.latitude === null).length,
        attempted: true,
        stoppedAtStatus: response.status,
      };
    }
    const body = (await response.json()) as { items?: Array<{ address?: string; mapx?: string; mapy?: string }> };
    const item = body.items?.[0];
    const latitude = Number(item?.mapy) / 10_000_000;
    const longitude = Number(item?.mapx) / 10_000_000;
    const road = store.address.replace(/\s+/g, "");
    const found = (item?.address ?? "").replace(/\s+/g, "");
    const regionOk = store.region_name !== "기타" && found.includes(store.region_name);
    const roadToken = road.replace(/^.*?(시|도)/, "").slice(0, 6);
    const roadOk = roadToken.length >= 2 && found.includes(roadToken);
    if (isKoreanCoordinate(latitude, longitude) && (regionOk || roadOk)) {
      store.latitude = Number(latitude.toFixed(7));
      store.longitude = Number(longitude.toFixed(7));
      filled += 1;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return {
    filled,
    stillMissing: stores.filter((store) => store.classification === "related" && store.latitude === null).length,
    attempted: true,
  };
}

function prepare(): { stores: PreparedStore[]; stats: Record<string, unknown> } {
  const text = new TextDecoder("euc-kr").decode(fs.readFileSync(CSV_PATH));
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim().length > 0));
  const header = rows[0] ?? [];
  const index = Object.fromEntries(header.map((name, position) => [name, position]));
  const cell = (row: string[], name: string) => (row[index[name]] ?? "").trim();
  let latest = "";
  const seenIds = new Set<string>();
  let duplicateIds = 0;
  let closed = 0;
  let missingName = 0;
  let missingCoordinate = 0;
  const candidates: PreparedStore[] = [];
  for (const row of rows.slice(1)) {
    const updated = cell(row, "데이터갱신시점");
    if (updated > latest) {
      latest = updated;
    }
    const status = cell(row, "영업상태명");
    const detail = cell(row, "상세영업상태명");
    if (status !== OPEN_STATUS || detail !== OPEN_DETAIL) {
      closed += 1;
      continue;
    }
    const orgCode = cell(row, "개방자치단체코드");
    const licenseNumber = cell(row, "관리번호");
    const sourceId = `${orgCode}:${licenseNumber}`;
    const name = cell(row, "사업장명").replace(/\s+/g, " ").trim();
    if (!orgCode || !licenseNumber || !name) {
      missingName += 1;
      continue;
    }
    if (seenIds.has(sourceId)) {
      duplicateIds += 1;
      continue;
    }
    seenIds.add(sourceId);
    const address = (cell(row, "도로명주소") || cell(row, "지번주소")).replace(/\s+/g, " ").trim();
    const coordinate = toWgs84(cell(row, "좌표정보(X)"), cell(row, "좌표정보(Y)"));
    if (!coordinate) {
      missingCoordinate += 1;
    }
    const classification = classifyYouthGameStore(name);
    candidates.push({
      source: PUBLIC_STORE_SOURCE,
      source_id: sourceId,
      name: name.slice(0, 160),
      address: address.slice(0, 300),
      latitude: coordinate?.latitude ?? null,
      longitude: coordinate?.longitude ?? null,
      business_status: status,
      detail_status: detail,
      classification,
      region_name: regionFromAddress(address),
      source_updated_at: parseTimestamp(cell(row, "최종수정시점") || updated),
      data_as_of: latest.slice(0, 10),
    });
  }
  const dataAsOf = latest.slice(0, 10);
  for (const store of candidates) {
    store.data_as_of = dataAsOf;
  }
  const byPlace = new Map<string, PreparedStore>();
  let duplicatePlaces = 0;
  const stores: PreparedStore[] = [];
  for (const store of candidates) {
    const key = `${normalizeStoreKey(store.name)}|${normalizeStoreKey(store.address)}`;
    if (normalizeStoreKey(store.address).length > 0 && byPlace.has(key)) {
      const current = byPlace.get(key);
      if (!current) {
        continue;
      }
      const far =
        current.latitude !== null &&
        current.longitude !== null &&
        store.latitude !== null &&
        store.longitude !== null &&
        haversineMeters(current.latitude, current.longitude, store.latitude, store.longitude) > 30;
      if (far) {
        stores.push(store);
        continue;
      }
      duplicatePlaces += 1;
      const currentScore = (current.latitude === null ? 0 : 2) + (current.source_updated_at ?? "");
      const nextScore = (store.latitude === null ? 0 : 2) + (store.source_updated_at ?? "");
      if (nextScore > currentScore) {
        const position = stores.indexOf(current);
        if (position >= 0) {
          stores[position] = store;
        }
        byPlace.set(key, store);
      }
      continue;
    }
    byPlace.set(key, store);
    stores.push(store);
  }
  const related = stores.filter((store) => store.classification === "related");
  const regions: Record<string, number> = {};
  for (const store of related.filter((item) => item.latitude !== null)) {
    regions[store.region_name] = (regions[store.region_name] ?? 0) + 1;
  }
  return {
    stores,
    stats: {
      sourceRows: rows.length - 1,
      closedOrNotOperating: closed,
      missingName,
      duplicateSourceIds: duplicateIds,
      duplicatePlaces,
      operatingPrepared: candidates.length,
      related: related.length,
      uncertain: stores.filter((store) => store.classification === "uncertain").length,
      relatedMissingCoordinate: related.filter((store) => store.latitude === null).length,
      missingCoordinateBeforeGeocode: missingCoordinate,
      dataAsOf,
      regions,
    },
  };
}

async function upsert(stores: PreparedStore[]): Promise<{ insertedOrUpdated: number }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase server credentials are missing");
  }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let insertedOrUpdated = 0;
  for (let offset = 0; offset < stores.length; offset += 200) {
    const batch = stores.slice(offset, offset + 200);
    const { error } = await supabase.from("public_stores").upsert(batch, { onConflict: "source,source_id" });
    if (error) {
      throw new Error(error.message);
    }
    insertedOrUpdated += batch.length;
  }
  return { insertedOrUpdated };
}

async function main(): Promise<void> {
  loadEnvFile();
  const prepared = prepare();
  const geocode = await geocodeMissing(prepared.stores);
  const relatedOnMap = prepared.stores.filter((store) => store.classification === "related" && store.latitude !== null).length;
  const summary = { ...prepared.stats, geocode, relatedOnMap };
  fs.mkdirSync("tmp-public-data", { recursive: true });
  fs.writeFileSync("tmp-public-data/stats.json", JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (process.argv.includes("--apply")) {
    const result = await upsert(prepared.stores);
    console.log(JSON.stringify({ applied: result.insertedOrUpdated }));
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "import failed";
  console.error(message.replace(/https?:\/\/\S+/g, "[url]"));
  process.exit(1);
});
