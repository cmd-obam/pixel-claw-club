import { describe, expect, it } from "vitest";
import { assessBudget, confirmationMatches, projectBudget } from "@/domain/budget";
import { computeRankings, type RankingMemberInput } from "@/domain/rankings";
import { findProbableDuplicate } from "@/domain/stores";
import {
  blockedTilesForLevel,
  eligibleVillagePrizes,
  findPath,
  isWalkable,
  mergeUnlockedLevel,
  villageLevelForCount,
} from "@/domain/village";
import { VillageSimulation } from "@/domain/village-sim";

describe("budget states", () => {
  it("classifies normal, warning, reached, and over without dividing by zero", () => {
    expect(assessBudget(0, 10_000).state).toBe("NORMAL");
    expect(assessBudget(7_999, 10_000).state).toBe("NORMAL");
    expect(assessBudget(8_000, 10_000).state).toBe("WARNING");
    expect(assessBudget(10_000, 10_000).state).toBe("REACHED");
    expect(assessBudget(10_001, 10_000).state).toBe("OVER");
    expect(assessBudget(10_001, 10_000).excess).toBe(1);
    expect(assessBudget(0, 0).usagePercent).toBeNull();
    expect(assessBudget(100, 0).state).toBe("OVER");
  });

  it("rejects a stale confirmation fingerprint", () => {
    const first = projectBudget({
      memberId: "member",
      weekStartIso: "2026-10-18T15:00:00.000Z",
      spentBefore: 9_000,
      amount: 2_000,
      budget: 10_000,
    });
    expect(first.exceeded).toBe(true);
    expect(confirmationMatches(first, first.fingerprint)).toBe(true);
    const changed = projectBudget({
      memberId: "member",
      weekStartIso: "2026-10-18T15:00:00.000Z",
      spentBefore: 9_500,
      amount: 2_000,
      budget: 10_000,
    });
    expect(confirmationMatches(changed, first.fingerprint)).toBe(false);
  });
});

describe("rankings", () => {
  const members: RankingMemberInput[] = [
    {
      memberId: "a",
      nickname: "멤버 A",
      attemptCount: 0,
      winCount: 0,
      prizeCount: 2,
      distinctStoreCount: 1,
      completedRevengeCount: 0,
      distinctDesignCount: 1,
      spending: null,
    },
    {
      memberId: "b",
      nickname: "멤버 B",
      attemptCount: 4,
      winCount: 2,
      prizeCount: 2,
      distinctStoreCount: 2,
      completedRevengeCount: 1,
      distinctDesignCount: 2,
      spending: 4_000,
    },
    {
      memberId: "c",
      nickname: "멤버 C",
      attemptCount: 4,
      winCount: 2,
      prizeCount: 1,
      distinctStoreCount: 2,
      completedRevengeCount: 1,
      distinctDesignCount: 1,
      spending: 2_000,
    },
  ];

  it("omits zero attempts, zero wins, and private spending", () => {
    const board = computeRankings(members, "week");
    const success = board.categories.find((category) => category.id === "success");
    const value = board.categories.find((category) => category.id === "value");
    expect(success?.rows.map((row) => row.memberId)).toEqual(["b", "c"]);
    expect(success?.rows[0]?.rank).toBe(1);
    expect(success?.rows[1]?.rank).toBe(1);
    expect(value?.rows.map((row) => row.memberId)).toEqual(["c", "b"]);
    expect(value?.definitive).toBe(false);
    expect(value?.note).toContain("금액 비공개");
    expect(JSON.stringify(value)).not.toContain("멤버 A");
  });
});

describe("stores and village", () => {
  it("does not treat a shared name far away as a duplicate", () => {
    const stores = [
      {
        id: "1",
        name: "행복오락실",
        address: "서울",
        latitude: 37.5,
        longitude: 127.0,
        deletedAt: null,
      },
    ];
    expect(
      findProbableDuplicate(stores, {
        name: "행복오락실",
        address: "부산",
        latitude: 35.1,
        longitude: 129.0,
      }),
    ).toBeNull();
    expect(
      findProbableDuplicate(stores, {
        name: "다른 간판",
        address: "옆 건물",
        latitude: 37.50001,
        longitude: 127,
      }),
    ).not.toBeNull();
  });

  it("calculates levels, keeps achievements, and walks around obstacles", () => {
    expect(villageLevelForCount(0).level).toBe(1);
    expect(villageLevelForCount(4).level).toBe(1);
    expect(villageLevelForCount(5).level).toBe(2);
    expect(villageLevelForCount(15).level).toBe(3);
    expect(villageLevelForCount(30).level).toBe(4);
    expect(villageLevelForCount(50).level).toBe(5);
    expect(mergeUnlockedLevel(4, 2)).toBe(4);
    const blocked = blockedTilesForLevel(3);
    expect(isWalkable(2, 2, blocked)).toBe(false);
    const path = findPath({ col: 1, row: 2 }, { col: 6, row: 2 }, blocked);
    expect(path).not.toBeNull();
    expect(path?.some((point) => !isWalkable(point.col, point.row, blocked))).toBe(false);
    const sim = new VillageSimulation(
      [
        { id: "p1", prizeId: "p1", ownerMemberId: "a", name: "하나", col: 1, row: 2 },
        { id: "dup", prizeId: "p1", ownerMemberId: "a", name: "중복", col: 1, row: 2 },
      ],
      { blocked, random: () => 0.9 },
    );
    expect(sim.characters).toHaveLength(1);
    for (let index = 0; index < 30; index += 1) {
      sim.step(500);
      const character = sim.characters[0];
      expect(character && isWalkable(character.col, character.row, blocked)).toBe(true);
    }
    sim.dispose();
    expect(sim.disposedFlag).toBe(true);
    sim.step(500);
    expect(sim.characters).toHaveLength(0);
    expect(
      eligibleVillagePrizes([
        { id: "1", visibility: "PRIVATE", deletedAt: null },
        { id: "2", visibility: "GROUP", deletedAt: null },
        { id: "3", visibility: "GROUP", deletedAt: "2026-01-01T00:00:00.000Z" },
      ]).map((prize) => prize.id),
    ).toEqual(["2"]);
  });
});
