export const PUBLIC_STORE_SOURCE = "mois-localdata:youth_game_providers";

export const PUBLIC_STORE_CITATION = {
  provider: "행정안전부 지방행정 인허가 데이터",
  dataset: "문화_청소년게임제공업",
  page: "https://www.data.go.kr/data/15045069/fileData.do",
  file: "https://file.localdata.go.kr/file/youth_game_providers/info",
  license: "이용허락범위 제한 없음",
  note: "영업 중인 업소의 이름에서 인형뽑기·뽑기·크레인 관련 표현이 보이는 곳만 지도에 표시합니다. 이름만으로 전국 매장을 모두 가려낸 것은 아닙니다.",
};

const STRONG_KEYWORDS = ["뽑", "인형", "가챠", "gacha", "크레인", "크래인", "crane", "claw", "캡슐", "미니돌", "피규어"];
const WEAK_KEYWORDS = ["캐치", "catch", "토이", "toy", "클로"];
const OTHER_BUSINESS = ["오락실", "오락", "플스", "플레이스테이션", "playstation", "피시방", "pc방", "보드게임", "노래연습"];

export type PublicStoreClassification = "related" | "uncertain";

export function normalizeStoreKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "").replace(/[()（）\-·.]/g, "");
}

export function classifyYouthGameStore(name: string): PublicStoreClassification {
  const value = normalizeStoreKey(name);
  if (STRONG_KEYWORDS.some((keyword) => value.includes(keyword))) {
    return "related";
  }
  const weak = WEAK_KEYWORDS.some((keyword) => value.includes(keyword));
  const other = OTHER_BUSINESS.some((keyword) => value.includes(normalizeStoreKey(keyword)));
  if (weak && !other) {
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
}

export interface ClusteredPoint extends ClusterInput {
  clusterCount: number;
}

export function clusterMapPoints(points: ClusterInput[], zoom: number): ClusteredPoint[] {
  const cell = gridCellDegrees(zoom);
  if (cell === null) {
    return points.map((point) => ({ ...point, clusterCount: 1 }));
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
      return { ...group[0], clusterCount: 1 };
    }
    const latitude = group.reduce((total, point) => total + point.latitude, 0) / group.length;
    const longitude = group.reduce((total, point) => total + point.longitude, 0) / group.length;
    return {
      id: `cluster:${latitude.toFixed(4)}:${longitude.toFixed(4)}`,
      name: `${group.length}곳`,
      address: "",
      latitude,
      longitude,
      clusterCount: group.length,
    };
  });
}
