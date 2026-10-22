import { describe, expect, it } from "vitest";
import {
  classifyYouthGameStore,
  clusterMapPoints,
  isKoreanCoordinate,
  regionFromAddress,
} from "@/domain/public-stores";

describe("youth game store classification", () => {
  it("treats claw and gacha names as related", () => {
    expect(classifyYouthGameStore("TOP 인형뽑기")).toBe("related");
    expect(classifyYouthGameStore("뽑파민 동묘점")).toBe("related");
    expect(classifyYouthGameStore("캑티 가챠샵 대학로점")).toBe("related");
    expect(classifyYouthGameStore("캐치랜드")).toBe("related");
  });

  it("keeps arcades and play-station rooms uncertain", () => {
    expect(classifyYouthGameStore("왕오락실 종각점")).toBe("uncertain");
    expect(classifyYouthGameStore("트레블 플스방")).toBe("uncertain");
    expect(classifyYouthGameStore("캐치 오락실")).toBe("uncertain");
  });

  it("reads the region from the start of an address", () => {
    expect(regionFromAddress("서울특별시 종로구 종로66길 13")).toBe("서울");
    expect(regionFromAddress("경기도 성남시 분당구")).toBe("경기");
    expect(regionFromAddress("광주광역시 동구")).toBe("광주");
  });

  it("accepts coordinates inside Korea only", () => {
    expect(isKoreanCoordinate(37.57, 126.98)).toBe(true);
    expect(isKoreanCoordinate(35.16, 126.85)).toBe(true);
    expect(isKoreanCoordinate(0, 0)).toBe(false);
  });

  it("groups distant points at a low zoom and keeps them separate when zoomed in", () => {
    const points = [
      { id: "a", name: "서울점", address: "서울", latitude: 37.57, longitude: 126.98 },
      { id: "b", name: "근처", address: "서울", latitude: 37.571, longitude: 126.981 },
      { id: "c", name: "광주점", address: "광주", latitude: 35.16, longitude: 126.85 },
    ];
    const wide = clusterMapPoints(points, 8);
    expect(wide).toHaveLength(2);
    expect(wide.some((point) => point.clusterCount === 2)).toBe(true);
    expect(clusterMapPoints(points, 16)).toHaveLength(3);
  });
});
