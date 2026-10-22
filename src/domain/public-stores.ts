export const PUBLIC_STORE_SOURCE = "mois-localdata:youth_game_providers";

export const PUBLIC_STORE_CITATION = {
  provider: "행정안전부 지방행정 인허가 데이터",
  dataset: "문화_청소년게임제공업, 문화_일반게임제공업",
  page: "https://www.data.go.kr/data/15045069/fileData.do",
  file: "https://file.localdata.go.kr/file/youth_game_providers/info",
  license: "이용허락범위 제한 없음",
  note: "이름은 분류 후보일 뿐입니다. 인형뽑기·오락실·미확인은 회원이 매장에서 확인한 값으로 바꿀 수 있습니다. 성인 전용 게임장과 PC방은 일반 오락실에 넣지 않습니다.",
};

const CLAW_KEYWORDS = ["인형뽑기", "뽑기방", "뽑기", "크레인", "크래인", "crane", "claw", "가챠", "gacha"];
const ARCADE_KEYWORDS = ["오락실", "아케이드", "arcade"];
const EXCLUDED_KEYWORDS = ["성인", "청소년이용불가", "피시방", "pc방", "피씨방", "플스", "플레이스테이션", "playstation", "보드게임", "노래연습", "노래방"];

export type StoreKind = "CLAW" | "ARCADE" | "UNKNOWN";
export type ClawPresence = "YES" | "NO" | "UNKNOWN";
export type PublicStoreClassification = "related" | "uncertain";

export const STORE_KIND_COLOR: Record<StoreKind, string> = {
  CLAW: "#F472A7",
  ARCADE: "#9370DB",
  UNKNOWN: "#9298A1",
};

export interface StoreKindDecision {
  kind: StoreKind;
  clawPresence: ClawPresence;
  reason: string;
  confidence: "high" | "low";
  include: boolean;
}

export function normalizeStoreKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "").replace(/[()（）\-·.]/g, "");
}

function hasKeyword(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(normalizeStoreKey(keyword)));
}

export function classifyStoreKind(name: string, gameRating = ""): StoreKindDecision {
  const storeName = normalizeStoreKey(name);
  const combined = normalizeStoreKey(`${name} ${gameRating}`);
  const excluded = hasKeyword(combined, EXCLUDED_KEYWORDS);
  const claw = hasKeyword(storeName, CLAW_KEYWORDS);
  const arcade = hasKeyword(storeName, ARCADE_KEYWORDS);
  if (excluded && !claw && !arcade) {
    return { kind: "UNKNOWN", clawPresence: "UNKNOWN", reason: "성인·PC·무관 업소로 오락실에 넣지 않음", confidence: "high", include: false };
  }
  if (arcade && claw) {
    return { kind: "ARCADE", clawPresence: "YES", reason: "이름에 오락실과 뽑기 표현이 함께 있음", confidence: "high", include: true };
  }
  if (claw) {
    return { kind: "CLAW", clawPresence: "YES", reason: "이름에 인형뽑기·뽑기·크레인 표현이 있음", confidence: "high", include: true };
  }
  if (arcade && !excluded) {
    return { kind: "ARCADE", clawPresence: "UNKNOWN", reason: "이름에 오락실·아케이드 표현이 있음", confidence: "high", include: true };
  }
  return { kind: "UNKNOWN", clawPresence: "UNKNOWN", reason: "이름만으로 유형을 확정하지 않음", confidence: "low", include: true };
}

export function classifyYouthGameStore(name: string): PublicStoreClassification {
  const value = normalizeStoreKey(name);
  const strong = ["뽑", "인형", "가챠", "gacha", "크레인", "크래인", "crane", "claw", "캡슐", "미니돌", "피규어"];
  const weak = ["캐치", "catch", "토이", "toy", "클로"];
  const other = ["오락실", "오락", "플스", "플레이스테이션", "playstation", "피시방", "pc방", "보드게임", "노래연습"];
  if (strong.some((keyword) => value.includes(keyword))) {
    return "related";
  }
  if (weak.some((keyword) => value.includes(keyword)) && !other.some((keyword) => value.includes(normalizeStoreKey(keyword)))) {
    return "related";
  }
  return "uncertain";
}

const REGIONS: Array<{ name: string; prefixes: string[] }> = [
  { name: "서울", prefixes: ["서울특별시", "서울"] },
  { name: "부산", prefixes: ["부산광역시", "부산"] },
  { name: "대구", prefixes: ["대구광역시", "대구"] },
  { name: "인천", prefixes: ["인천광역시", "인천"] },
  { name: "광주", prefixes: ["광주광역시", "광주"] },
  { name: "대전", prefixes: ["대전광역시", "대전"] },
  { name: "울산", prefixes: ["울산광역시", "울산"] },
  { name: "세종", prefixes: ["세종특별자치시", "세종"] },
  { name: "경기", prefixes: ["경기도", "경기"] },
  { name: "강원", prefixes: ["강원특별자치도", "강원도", "강원"] },
  { name: "충북", prefixes: ["충청북도", "충북"] },
  { name: "충남", prefixes: ["충청남도", "충남"] },
  { name: "전북", prefixes: ["전북특별자치도", "전라북도", "전북"] },
  { name: "전남", prefixes: ["전라남도", "전남"] },
  { name: "경북", prefixes: ["경상북도", "경북"] },
  { name: "경남", prefixes: ["경상남도", "경남"] },
  { name: "제주", prefixes: ["제주특별자치도", "제주"] },
];

export function regionFromAddress(address: string): string {
  const compact = address.replace(/\s+/g, "");
  for (const region of REGIONS) {
    if (region.prefixes.some((prefix) => compact.startsWith(prefix))) {
      return region.name;
    }
  }
  return "기타";
}

export function isKoreanCoordinate(latitude: number, longitude: number): boolean {
  return latitude >= 33 && latitude <= 39.2 && longitude >= 124.4 && longitude <= 132.1;
}

export function gridCellDegrees(zoom: number): number | null {
  if (zoom >= 14) {
    return null;
  }
  const clamped = Math.max(6, Math.min(13, Math.round(zoom)));
  return 0.006 * 2 ** (14 - clamped);
}

export interface ClusterInput {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  storeKind?: StoreKind;
}

export interface ClusteredPoint extends ClusterInput {
  clusterCount: number;
  storeKind: StoreKind;
}

export function clusterMapPoints(points: ClusterInput[], zoom: number): ClusteredPoint[] {
  const cell = gridCellDegrees(zoom);
  if (cell === null) {
    return points.map((point) => ({ ...point, clusterCount: 1, storeKind: point.storeKind ?? "UNKNOWN" }));
  }
  const groups = new Map<string, ClusterInput[]>();
  for (const point of points) {
    const key = `${Math.floor(point.latitude / cell)}:${Math.floor(point.longitude / cell)}`;
    const group = groups.get(key);
    if (group) {
      group.push(point);
    } else {
      groups.set(key, [point]);
    }
  }
  return [...groups.values()].map((group) => {
    if (group.length === 1) {
      return { ...group[0], clusterCount: 1, storeKind: group[0].storeKind ?? "UNKNOWN" };
    }
    const latitude = group.reduce((total, point) => total + point.latitude, 0) / group.length;
    const longitude = group.reduce((total, point) => total + point.longitude, 0) / group.length;
    const counts = new Map<StoreKind, number>();
    for (const point of group) {
      const kind = point.storeKind ?? "UNKNOWN";
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    const storeKind = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "UNKNOWN";
    return {
      id: `cluster:${latitude.toFixed(4)}:${longitude.toFixed(4)}`,
      name: `${group.length}곳`,
      address: "",
      latitude,
      longitude,
      storeKind,
      clusterCount: group.length,
    };
  });
}
