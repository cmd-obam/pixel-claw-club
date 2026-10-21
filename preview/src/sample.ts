import { formatKrw } from "@/domain/money";
import { computeRankings, type RankingMemberInput } from "@/domain/rankings";

export const SAMPLE_NOTICE =
  "GitHub Pages 정적 미리보기입니다. 아래 숫자와 이름은 샘플이며, 저장되거나 로그인되지 않습니다.";

export type SampleStore = {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  visited: boolean;
  revenge: boolean;
  visitCount: number;
  winCount: number;
  failCount: number;
  spendingLabel: string;
};

export const sampleStores: SampleStore[] = [
  {
    id: "sample-store-1",
    name: "샘플 오락실 강남",
    address: "샘플 주소 · 서울 강남구",
    latitude: 37.4979,
    longitude: 127.0276,
    visited: true,
    revenge: false,
    visitCount: 2,
    winCount: 1,
    failCount: 3,
    spendingLabel: "샘플 공개 금액 4,000원",
  },
  {
    id: "sample-store-2",
    name: "샘플 오락실 홍대",
    address: "샘플 주소 · 서울 마포구",
    latitude: 37.5563,
    longitude: 126.9236,
    visited: true,
    revenge: true,
    visitCount: 1,
    winCount: 0,
    failCount: 2,
    spendingLabel: "금액 비공개",
  },
  {
    id: "sample-store-3",
    name: "샘플 오락실 잠실",
    address: "샘플 주소 · 서울 송파구",
    latitude: 37.5133,
    longitude: 127.1002,
    visited: false,
    revenge: false,
    visitCount: 0,
    winCount: 0,
    failCount: 0,
    spendingLabel: "지출 기록 없음",
  },
  {
    id: "sample-store-4",
    name: "샘플 오락실 좌표없음",
    address: "샘플 주소 · 좌표 없음",
    latitude: null,
    longitude: null,
    visited: false,
    revenge: false,
    visitCount: 0,
    winCount: 0,
    failCount: 0,
    spendingLabel: "지출 기록 없음",
  },
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
