import { formatKrw } from "@/domain/money";
import { computeRankings, type RankingMemberInput } from "@/domain/rankings";

export const SAMPLE_NOTICE =
  "GitHub Pages 정적 미리보기입니다. 아래 숫자와 이름은 샘플이며, 저장되거나 로그인되지 않습니다.";

export const sampleStores = [
  { id: "sample-store-1", name: "샘플 오락실 강남", address: "샘플 주소 · 서울 강남", marker: "좌표 샘플 · 마커는 미리보기에서 그리지 않습니다" },
  { id: "sample-store-2", name: "샘플 오락실 홍대", address: "샘플 주소 · 서울 마포", marker: "좌표 없음 · 목록에만 표시" },
];

export const sampleRecords = [
  { id: "sample-record-1", store: "샘플 오락실 강남", player: "샘플 멤버 A", attempts: 4, wins: 1, amount: 4000 },
  { id: "sample-record-2", store: "샘플 오락실 홍대", player: "샘플 멤버 B", attempts: 2, wins: 0, amount: null },
];

export const sampleBudget = {
  spent: 4000,
  budget: 10000,
};

export const sampleMembers: RankingMemberInput[] = [
  {
    memberId: "sample-a",
    nickname: "샘플 멤버 A",
    attemptCount: 4,
    winCount: 1,
    prizeCount: 2,
    distinctStoreCount: 2,
    completedRevengeCount: 1,
    distinctDesignCount: 2,
    spending: 4000,
  },
  {
    memberId: "sample-b",
    nickname: "샘플 멤버 B",
    attemptCount: 2,
    winCount: 0,
    prizeCount: 1,
    distinctStoreCount: 1,
    completedRevengeCount: 0,
    distinctDesignCount: 1,
    spending: null,
  },
  {
    memberId: "sample-c",
    nickname: "샘플 멤버 C",
    attemptCount: 0,
    winCount: 0,
    prizeCount: 3,
    distinctStoreCount: 1,
    completedRevengeCount: 0,
    distinctDesignCount: 2,
    spending: 0,
  },
];

export const sampleRankings = computeRankings(sampleMembers, "week");

export const sampleCharacters = [
  { id: "sample-prize-1", prizeId: "sample-prize-1", ownerMemberId: "sample-a", name: "샘플 토끼", col: 4, row: 6 },
  { id: "sample-prize-2", prizeId: "sample-prize-2", ownerMemberId: "sample-b", name: "샘플 곰", col: 8, row: 4 },
  { id: "sample-prize-3", prizeId: "sample-prize-3", ownerMemberId: "sample-c", name: "샘플 고양이", col: 12, row: 3 },
];

export function sampleMoney(amount: number): string {
  return formatKrw(amount);
}
