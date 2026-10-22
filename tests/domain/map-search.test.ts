import { describe, expect, it } from "vitest";
import { buildIlikeOr, resolveSearchArea, storeSearchPatterns, textMatchesStoreQuery } from "@/domain/map-search";

describe("map search", () => {
  it("resolves the requested region names to different places", () => {
    expect(resolveSearchArea("서울")?.label).toBe("서울");
    expect(resolveSearchArea("홍대")?.zoom).toBe(16);
    expect(resolveSearchArea("강남역")?.latitude).toBeGreaterThan(37.4);
    expect(resolveSearchArea("마포구")?.label).toBe("마포구");
    expect(resolveSearchArea("광주")?.latitude).toBeLessThan(36);
    expect(resolveSearchArea("경기 광주")?.latitude).toBeGreaterThan(37);
    expect(resolveSearchArea("경기 고양시")?.label).toBe("경기 고양시");
    expect(resolveSearchArea("부산 서면")?.longitude).toBeGreaterThan(129);
    expect(resolveSearchArea("없는매장xyz")).toBeNull();
  });

  it("matches a store name when only the spacing differs", () => {
    expect(textMatchesStoreQuery("신림 오락실", "서울특별시 관악구", "신림오락실")).toBe(true);
    expect(storeSearchPatterns("신림 오락실").some((pattern) => pattern.includes("%오락실%"))).toBe(true);
    expect(textMatchesStoreQuery("모모스테이션", "서울", "없는매장xyz")).toBe(false);
    expect(buildIlikeOr("수유오락실", ["name"])).toContain("name.ilike.");
    expect(storeSearchPatterns(" ")).toEqual([]);
  });
});
