import { isKoreanCoordinate } from "@/domain/public-stores";

export interface GeocodedPlace {
  label: string;
  latitude: number;
  longitude: number;
}

let naverLocalSearch: "unknown" | "ready" | "unavailable" = "unknown";

export function naverLocalSearchStatus(): "unknown" | "ready" | "unavailable" {
  return naverLocalSearch;
}

export async function geocodePlaceName(query: string): Promise<GeocodedPlace | null> {
  const id = process.env.NAVER_SEARCH_CLIENT_ID ?? "";
  const secret = process.env.NAVER_SEARCH_CLIENT_SECRET ?? "";
  if (naverLocalSearch === "unavailable" || !id || !secret) {
    naverLocalSearch = "unavailable";
    return null;
  }
  let response: Response;
  try {
    response = await fetch(`https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=5`, {
      headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
    });
  } catch {
    naverLocalSearch = "unavailable";
    return null;
  }
  if (!response.ok) {
    naverLocalSearch = "unavailable";
    return null;
  }
  const body: unknown = await response.json();
  const items = body && typeof body === "object" && "items" in body && Array.isArray(body.items) ? body.items : [];
  naverLocalSearch = "ready";
  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as { title?: unknown; mapx?: unknown; mapy?: unknown };
    const latitude = Number(record.mapy) / 10_000_000;
    const longitude = Number(record.mapx) / 10_000_000;
    if (!isKoreanCoordinate(latitude, longitude)) {
      continue;
    }
    const label = String(record.title ?? query).replace(/<[^>]+>/g, "").trim() || query;
    return { label, latitude, longitude };
  }
  return null;
}
