export type RankingPeriod = "week" | "month" | "all";

export interface RankingMemberInput {
  memberId: string;
  nickname: string;
  attemptCount: number;
  winCount: number;
  prizeCount: number;
  distinctStoreCount: number;
  completedRevengeCount: number;
  distinctDesignCount: number;
  /** Null means this member did not authorize spending comparison. */
  spending: number | null;
}

export interface RankedRow {
  rank: number;
  memberId: string;
  nickname: string;
  value: number;
  valueLabel: string;
}

export interface RankingCategory {
  id:
    | "prizes"
    | "value"
    | "success"
    | "expedition"
    | "revenge"
    | "encyclopedia";
  title: string;
  rows: RankedRow[];
  definitive: boolean;
  note: string | null;
}

export interface RankingBoard {
  period: RankingPeriod;
  activeMemberCount: number;
  disclosedSpendingCount: number;
  categories: RankingCategory[];
}

function tieBreak(a: RankingMemberInput, b: RankingMemberInput): number {
  const name = a.nickname.localeCompare(b.nickname, "ko");
  if (name !== 0) {
    return name;
  }
  return a.memberId.localeCompare(b.memberId);
}

function rankValues(
  members: RankingMemberInput[],
  read: (member: RankingMemberInput) => number | null,
  direction: "asc" | "desc",
  label: (value: number) => string,
): RankedRow[] {
  const eligible = members
    .map((member) => ({ member, value: read(member) }))
    .filter((item): item is { member: RankingMemberInput; value: number } => item.value !== null);
  eligible.sort((a, b) => {
    const diff = direction === "desc" ? b.value - a.value : a.value - b.value;
    if (diff !== 0) {
      return diff;
    }
    return tieBreak(a.member, b.member);
  });
  let lastValue: number | null = null;
  let lastRank = 0;
  return eligible.map((item, index) => {
    const rank = lastValue !== null && item.value === lastValue ? lastRank : index + 1;
    lastValue = item.value;
    lastRank = rank;
    return {
      rank,
      memberId: item.member.memberId,
      nickname: item.member.nickname,
      value: item.value,
      valueLabel: label(item.value),
    };
  });
}

const percent = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

export function computeRankings(
  members: RankingMemberInput[],
  period: RankingPeriod,
): RankingBoard {
  const activeMemberCount = members.length;
  const disclosed = members.filter((member) => member.spending !== null);
  const spendingIncomplete = disclosed.length !== activeMemberCount;
  const spendingNote = spendingIncomplete
    ? "금액 비공개로 일부 멤버는 비교에서 제외됩니다."
    : null;

  const categories: RankingCategory[] = [
    {
      id: "prizes",
      title: "획득왕",
      definitive: true,
      note: null,
      rows: rankValues(
        members,
        (member) => member.prizeCount,
        "desc",
        (value) => `${value}개`,
      ),
    },
    {
      id: "value",
      title: "가성비왕",
      definitive: !spendingIncomplete && disclosed.length > 0,
      note: spendingNote,
      rows: rankValues(
        members,
        (member) =>
          member.spending === null || member.winCount <= 0
            ? null
            : member.spending / member.winCount,
        "asc",
        (value) => `${new Intl.NumberFormat("ko-KR").format(Math.round(value))}원`,
      ),
    },
    {
      id: "success",
      title: "성공률왕",
      definitive: true,
      note: null,
      rows: rankValues(
        members,
        (member) =>
          member.attemptCount <= 0 ? null : member.winCount / member.attemptCount,
        "desc",
        (value) => `${percent.format(value * 100)}%`,
      ),
    },
    {
      id: "expedition",
      title: "원정왕",
      definitive: true,
      note: null,
      rows: rankValues(
        members,
        (member) => member.distinctStoreCount,
        "desc",
        (value) => `${value}곳`,
      ),
    },
    {
      id: "revenge",
      title: "복수왕",
      definitive: true,
      note: null,
      rows: rankValues(
        members,
        (member) => member.completedRevengeCount,
        "desc",
        (value) => `${value}회`,
      ),
    },
    {
      id: "encyclopedia",
      title: "도감왕",
      definitive: true,
      note: null,
      rows: rankValues(
        members,
        (member) => member.distinctDesignCount,
        "desc",
        (value) => `${value}종`,
      ),
    },
  ];

  return {
    period,
    activeMemberCount,
    disclosedSpendingCount: disclosed.length,
    categories,
  };
}

export const PERIOD_LABELS: Record<RankingPeriod, string> = {
  week: "이번 주",
  month: "이번 달",
  all: "전체",
};
