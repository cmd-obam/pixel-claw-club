import fs from "node:fs";
import { createRequire } from "node:module";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { classifyStoreKind, isKoreanCoordinate, normalizeStoreKey, regionFromAddress } from "../src/domain/public-stores.ts";

const require = createRequire(import.meta.url);
const proj4 = require("proj4") as {
  defs: (name: string, definition: string) => void;
  (from: string, to: string, coordinate: [number, number]): [number, number];
};
proj4.defs(
  "EPSG:5174",
  "+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43 +units=m +no_defs",
);

const GENERAL_SOURCE = "mois-localdata:general_game_providers";

function loadEnvFile(): void {
  if (!fs.existsSync(".env.local")) return;
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const splitAt = trimmed.indexOf("=");
    const key = trimmed.slice(0, splitAt).trim();
    let value = trimmed.slice(splitAt + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
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
        } else quoted = false;
      } else current += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(current);
      current = "";
    } else if (char === "\n") {
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
    } else if (char !== "\r") current += char;
  }
  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }
  return rows.filter((item) => item.some((cell) => cell.trim()));
}

function toWgs84(xText: string, yText: string): { latitude: number; longitude: number } | null {
  const x = Number(xText);
  const y = Number(yText);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x === 0 || y === 0) return null;
  const [longitude, latitude] = proj4("EPSG:5174", "WGS84", [x, y]);
  if (!isKoreanCoordinate(latitude, longitude)) return null;
  return { latitude: Number(latitude.toFixed(7)), longitude: Number(longitude.toFixed(7)) };
}

async function existingKeys(supabase: SupabaseClient): Promise<{ ids: Set<string>; places: Set<string>; rows: Array<{ id: string; name: string; verified: boolean }> }> {
  const ids = new Set<string>();
  const places = new Set<string>();
  const rows: Array<{ id: string; name: string; verified: boolean }> = [];
  for (let from = 0; from < 30000; from += 1000) {
    const page = await supabase.from("public_stores").select("id,source,source_id,name,address,verified_by").range(from, from + 999);
    if (page.error && /verified_by/.test(page.error.message)) {
      const plain = await supabase.from("public_stores").select("id,source,source_id,name,address").range(from, from + 999);
      if (plain.error) throw new Error(plain.error.message);
      for (const row of plain.data ?? []) {
        ids.add(`${row.source}:${row.source_id}`);
        places.add(`${normalizeStoreKey(row.name)}|${normalizeStoreKey(row.address ?? "")}`);
        rows.push({ id: row.id, name: row.name, verified: false });
      }
      if ((plain.data ?? []).length < 1000) break;
      continue;
    }
    if (page.error) throw new Error(page.error.message);
    for (const row of page.data ?? []) {
      ids.add(`${row.source}:${row.source_id}`);
      places.add(`${normalizeStoreKey(row.name)}|${normalizeStoreKey(row.address ?? "")}`);
      rows.push({ id: row.id, name: row.name, verified: Boolean(row.verified_by) });
    }
    if ((page.data ?? []).length < 1000) break;
  }
  return { ids, places, rows };
}

async function main(): Promise<void> {
  loadEnvFile();
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const probe = await supabase.from("public_stores").select("store_kind").limit(1);
  const hasKind = !probe.error;
  const current = await existingKeys(supabase);
  const counts = { CLAW: 0, ARCADE: 0, UNKNOWN: 0, locked: 0 };
  if (hasKind && process.argv.includes("--apply")) {
    const groups = new Map<string, string[]>();
    for (const row of current.rows) {
      if (row.verified) {
        counts.locked += 1;
        continue;
      }
      const decision = classifyStoreKind(row.name);
      counts[decision.kind] += 1;
      const key = `${decision.kind}|${decision.clawPresence}|${decision.reason}|${decision.confidence}`;
      const list = groups.get(key) ?? [];
      list.push(row.id);
      groups.set(key, list);
    }
    for (const [key, ids] of groups) {
      const [kind, claw, reason, confidence] = key.split("|");
      for (let offset = 0; offset < ids.length; offset += 100) {
        const { error } = await supabase
          .from("public_stores")
          .update({ store_kind: kind, claw_presence: claw, classification_reason: reason, classification_confidence: confidence })
          .in("id", ids.slice(offset, offset + 100))
          .is("verified_by", null);
        if (error) throw new Error(error.message);
      }
    }
  } else {
    for (const row of current.rows) {
      counts[classifyStoreKind(row.name).kind] += 1;
    }
  }

  const text = new TextDecoder("euc-kr").decode(fs.readFileSync("tmp-public-data/general.csv"));
  const table = parseCsv(text);
  const header = table[0] ?? [];
  const index = Object.fromEntries(header.map((name, position) => [name, position]));
  const cell = (row: string[], name: string) => (row[index[name]] ?? "").trim();
  let latest = "";
  let closed = 0;
  let excluded = 0;
  let missingCoordinate = 0;
  let duplicate = 0;
  const fresh = [];
  for (const record of table.slice(1)) {
    const updated = cell(record, "데이터갱신시점");
    if (updated > latest) latest = updated;
    if (cell(record, "영업상태명") !== "영업/정상" || cell(record, "상세영업상태명") !== "영업중") {
      closed += 1;
      continue;
    }
    const name = cell(record, "사업장명").replace(/\s+/g, " ").trim();
    const decision = classifyStoreKind(name, cell(record, "제공게임물명"));
    if (!decision.include || decision.kind !== "ARCADE") {
      excluded += 1;
      continue;
    }
    const coordinate = toWgs84(cell(record, "좌표정보(X)"), cell(record, "좌표정보(Y)"));
    if (!coordinate) {
      missingCoordinate += 1;
      continue;
    }
    const sourceId = `${cell(record, "개방자치단체코드")}:${cell(record, "관리번호")}`;
    const address = (cell(record, "도로명주소") || cell(record, "지번주소")).replace(/\s+/g, " ").trim();
    const placeKey = `${normalizeStoreKey(name)}|${normalizeStoreKey(address)}`;
    if (current.ids.has(`${GENERAL_SOURCE}:${sourceId}`) || (address && current.places.has(placeKey))) {
      duplicate += 1;
      continue;
    }
    current.ids.add(`${GENERAL_SOURCE}:${sourceId}`);
    current.places.add(placeKey);
    fresh.push({
      source: GENERAL_SOURCE,
      source_id: sourceId,
      name: name.slice(0, 160),
      address: address.slice(0, 300),
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      business_status: "영업/정상",
      detail_status: "영업중",
      classification: "uncertain",
      region_name: regionFromAddress(address),
      source_updated_at: null,
      data_as_of: null,
      ...(hasKind
        ? {
            store_kind: decision.kind,
            claw_presence: decision.clawPresence,
            classification_reason: decision.reason,
            classification_confidence: decision.confidence,
          }
        : {}),
    });
  }
  const dataAsOf = latest.slice(0, 10) || null;
  for (const row of fresh) row.data_as_of = dataAsOf;
  let inserted = 0;
  if (process.argv.includes("--apply")) {
    for (let offset = 0; offset < fresh.length; offset += 200) {
      const { error } = await supabase.from("public_stores").upsert(fresh.slice(offset, offset + 200), {
        onConflict: "source,source_id",
        ignoreDuplicates: true,
      });
      if (error) throw new Error(error.message);
      inserted += Math.min(200, fresh.length - offset);
    }
  }
  console.log(JSON.stringify({
    existing: current.rows.length,
    classified: counts,
    kindColumn: hasKind,
    generalRows: table.length - 1,
    closedOrNotArcade: closed,
    excludedNotClearArcade: excluded,
    missingCoordinate,
    duplicate,
    newArcades: fresh.length,
    inserted,
    dataAsOf: latest.slice(0, 10),
  }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "failed";
  console.error(message.replace(/https?:\/\/\S+/g, "[url]"));
  process.exit(1);
});
