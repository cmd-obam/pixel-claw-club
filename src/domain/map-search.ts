import { normalizeStoreKey } from "@/domain/public-stores";

export const MAP_SEARCH_PAGE_SIZE = 15;

export interface SearchArea {
  label: string;
  latitude: number;
  longitude: number;
  zoom: number;
  radiusMeters: number;
}

const AREAS: Array<SearchArea & { aliases: string[] }> = [
  { label: "서울", latitude: 37.5663, longitude: 126.9779, zoom: 11, radiusMeters: 12000, aliases: ["서울", "서울특별시"] },
  { label: "홍대", latitude: 37.5572, longitude: 126.9245, zoom: 16, radiusMeters: 800, aliases: ["홍대", "홍대입구", "홍대입구역"] },
  { label: "강남역", latitude: 37.4981, longitude: 127.0276, zoom: 16, radiusMeters: 700, aliases: ["강남역"] },
  { label: "강남", latitude: 37.5172, longitude: 127.0473, zoom: 14, radiusMeters: 2500, aliases: ["강남", "강남구"] },
  { label: "마포구", latitude: 37.5663, longitude: 126.9018, zoom: 13, radiusMeters: 4000, aliases: ["마포", "마포구"] },
  { label: "광주", latitude: 35.1601, longitude: 126.8514, zoom: 11, radiusMeters: 12000, aliases: ["광주", "광주광역시"] },
  { label: "경기 광주", latitude: 37.4294, longitude: 127.2551, zoom: 12, radiusMeters: 8000, aliases: ["경기 광주", "경기도 광주", "광주시"] },
  { label: "경기 고양시", latitude: 37.6584, longitude: 126.832, zoom: 12, radiusMeters: 8000, aliases: ["고양", "고양시", "경기 고양", "경기 고양시", "경기도 고양시"] },
  { label: "부산 서면", latitude: 35.1578, longitude: 129.0595, zoom: 16, radiusMeters: 700, aliases: ["서면", "부산 서면", "부산서면"] },
  { label: "부산", latitude: 35.1796, longitude: 129.0756, zoom: 11, radiusMeters: 12000, aliases: ["부산", "부산광역시"] },
];

const NAME_SUFFIXES = ["인형뽑기", "뽑기방", "오락실", "아케이드", "뽑기", "크레인"];

export function resolveSearchArea(query: string): SearchArea | null {
  const key = normalizeStoreKey(query);
  const found = AREAS.find((area) => area.aliases.some((alias) => normalizeStoreKey(alias) === key));
  if (!found) {
    return null;
  }
  return {
    label: found.label,
    latitude: found.latitude,
    longitude: found.longitude,
    zoom: found.zoom,
    radiusMeters: found.radiusMeters,
  };
}

export function storeSearchPatterns(query: string): string[] {
  const compact = normalizeStoreKey(query).replace(/[%_*",.()\\]/g, "");
  if (compact.length < 2) {
    return [];
  }
  const patterns = new Set<string>([`%${compact}%`]);
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((token) => normalizeStoreKey(token).replace(/[%_*",.()\\]/g, ""))
    .filter((token) => token.length > 0);
  if (tokens.length > 1) {
    patterns.add(`%${tokens.join("%")}%`);
  }
  for (const suffix of NAME_SUFFIXES) {
    if (compact.endsWith(normalizeStoreKey(suffix)) && compact.length > suffix.length + 1) {
      patterns.add(`%${compact.slice(0, -normalizeStoreKey(suffix).length)}%${normalizeStoreKey(suffix)}%`);
    }
  }
  return [...patterns];
}

export function buildIlikeOr(query: string, columns: Array<"name" | "address">): string | null {
  const patterns = storeSearchPatterns(query);
  if (patterns.length === 0 || columns.length === 0) {
    return null;
  }
  return columns.flatMap((column) => patterns.map((pattern) => `${column}.ilike."${pattern}"`)).join(",");
}

export function textMatchesStoreQuery(name: string, address: string, query: string): boolean {
  const needle = normalizeStoreKey(query);
  if (needle.length < 2) {
    return false;
  }
  return normalizeStoreKey(name).includes(needle) || normalizeStoreKey(address).includes(needle);
}

export function looksLikePlaceName(query: string): boolean {
  return /(역|구|동|읍|면|리|로|길)$/.test(query.trim());
}
