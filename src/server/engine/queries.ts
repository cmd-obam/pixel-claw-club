import { assessBudget, type BudgetAssessment } from "@/domain/budget";
import { formatKrw } from "@/domain/money";
import {
  computeRankings,
  PERIOD_LABELS,
  type RankingBoard,
  type RankingMemberInput,
  type RankingPeriod,
} from "@/domain/rankings";
import { sumSpending } from "@/domain/records";
import {
  inRange,
  seoulMonthRange,
  seoulWeekRange,
  type TimeRange,
} from "@/domain/time";
import {
  blockedTilesForLevel,
  resolveSpriteKind,
  villageLevelForCount,
} from "@/domain/village";
import {
  activeMembers,
  canViewPrize,
  nickname,
  privacyOf,
  recordStoreId,
  requireActiveMember,
  spendingComparisonAllowed,
  syncVillage,
  viewerSharesAmount,
  type Clock,
  type ClubState,
  type Prize,
} from "@/server/engine/club-engine";

export interface MoneyCell {
  visible: boolean;
  amount: number | null;
}

export interface RecordView {
  id: string;
  playerId: string;
  playerNickname: string;
  storeId: string | null;
  storeName: string;
  playedAt: string;
  attemptCount: number;
  winCount: number;
  machineLabel: string;
  notes: string;
  deleted: boolean;
  amount: MoneyCell;
  canEdit: boolean;
}

export interface BudgetDashboard {
  week: BudgetAssessment;
  monthSpent: number;
  lifetimeSpent: number;
  averageCostPerWin: number | null;
  wins: number;
  history: Array<{ id: string; playedAt: string; storeName: string; amount: number }>;
  storeBreakdown: Array<{ storeId: string; storeName: string; amount: number }>;
  weekStart: string;
  weekEnd: string;
}

export interface DisclosedTotal {
  coverage: "complete" | "partial";
  permittedSpent: number;
  groupTotal: number | null;
  peers: Array<{ memberId: string; nickname: string; spent: number }>;
}

function money(visible: boolean, amount: number): MoneyCell {
  return visible ? { visible: true, amount } : { visible: false, amount: null };
}

function amountOf(state: ClubState, recordId: string): number {
  return state.financialRecords.find((row) => row.playRecordId === recordId)?.amountSpent ?? 0;
}

function storeName(state: ClubState, storeId: string | null): string {
  if (!storeId) {
    return "매장 없음";
  }
  return state.stores.find((store) => store.id === storeId)?.name ?? "매장";
}

export function listRecordViews(
  state: ClubState,
  viewerId: string,
  includeDeleted = false,
): RecordView[] {
  const viewer = requireActiveMember(state, viewerId);
  return state.playRecords
    .filter((record) => record.groupId === viewer.groupId && (includeDeleted || !record.deletedAt))
    .map((record) => {
      const storeId = recordStoreId(state, record);
      const visible = viewerSharesAmount(
        state,
        viewerId,
        record.playerId,
        "showIndividualRecordAmounts",
      );
      return {
        id: record.id,
        playerId: record.playerId,
        playerNickname: nickname(state, record.playerId),
        storeId,
        storeName: storeName(state, storeId),
        playedAt: record.playedAt,
        attemptCount: record.attemptCount,
        winCount: record.winCount,
        machineLabel: record.machineLabel,
        notes: record.notes,
        deleted: Boolean(record.deletedAt),
        amount: money(visible, amountOf(state, record.id)),
        canEdit: record.playerId === viewerId && !record.deletedAt,
      };
    })
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt));
}

function spendable(state: ClubState) {
  return state.playRecords.map((record) => ({
    id: record.id,
    playerId: record.playerId,
    playedAt: record.playedAt,
    deletedAt: record.deletedAt,
    amountSpent: amountOf(state, record.id),
  }));
}

export function personalBudget(
  state: ClubState,
  memberId: string,
  now: Date,
): BudgetDashboard {
  const rows = spendable(state).filter((row) => row.playerId === memberId && !row.deletedAt);
  const week = seoulWeekRange(now);
  const month = seoulMonthRange(now);
  const weekSpent = sumSpending(rows, memberId, week);
  const budget = state.budgetSettings.find((row) => row.memberId === memberId)?.weeklyBudgetKrw ?? 0;
  const wins = state.playRecords
    .filter((record) => record.playerId === memberId && !record.deletedAt)
    .reduce((total, record) => total + record.winCount, 0);
  const lifetimeSpent = sumSpending(rows, memberId, null);
  const byStore = new Map<string, number>();
  for (const record of state.playRecords.filter((item) => item.playerId === memberId && !item.deletedAt)) {
    const storeId = recordStoreId(state, record) ?? "none";
    byStore.set(storeId, (byStore.get(storeId) ?? 0) + amountOf(state, record.id));
  }
  return {
    week: assessBudget(weekSpent, budget),
    monthSpent: sumSpending(rows, memberId, month),
    lifetimeSpent,
    averageCostPerWin: wins > 0 ? lifetimeSpent / wins : null,
    wins,
    history: rows
      .map((row) => ({
        id: row.id,
        playedAt: row.playedAt,
        storeName: storeName(state, recordStoreId(state, state.playRecords.find((record) => record.id === row.id)!)),
        amount: row.amountSpent,
      }))
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt)),
    storeBreakdown: [...byStore.entries()].map(([storeId, amount]) => ({
      storeId,
      storeName: storeName(state, storeId === "none" ? null : storeId),
      amount,
    })),
    weekStart: week.start.toISOString(),
    weekEnd: week.end.toISOString(),
  };
}

export function disclosedWeekly(
  state: ClubState,
  viewerId: string,
  now: Date,
): DisclosedTotal {
  const viewer = requireActiveMember(state, viewerId);
  const members = activeMembers(state, viewer.groupId);
  const range = seoulWeekRange(now);
  const peers: DisclosedTotal["peers"] = [];
  let permitted = 0;
  let hidden = 0;
  for (const member of members) {
    const spent = sumSpending(spendable(state), member.userId, range);
    const visible =
      member.userId === viewerId ||
      viewerSharesAmount(state, viewerId, member.userId, "showWeeklySpending");
    if (!visible) {
      hidden += 1;
      continue;
    }
    permitted += spent;
    if (member.userId !== viewerId) {
      peers.push({ memberId: member.userId, nickname: nickname(state, member.userId), spent });
    }
  }
  const complete = hidden === 0;
  return {
    coverage: complete ? "complete" : "partial",
    permittedSpent: permitted,
    groupTotal: complete ? permitted : null,
    peers,
  };
}

function periodRange(period: RankingPeriod, now: Date): TimeRange | null {
  if (period === "week") {
    return seoulWeekRange(now);
  }
  if (period === "month") {
    return seoulMonthRange(now);
  }
  return null;
}

function spendingField(period: RankingPeriod): "showWeeklySpending" | "showMonthlyStatistics" | "showTotalSpending" {
  if (period === "week") {
    return "showWeeklySpending";
  }
  if (period === "month") {
    return "showMonthlyStatistics";
  }
  return "showTotalSpending";
}

export function rankingBoard(
  state: ClubState,
  viewerId: string,
  period: RankingPeriod,
  now: Date,
): RankingBoard {
  const viewer = requireActiveMember(state, viewerId);
  const range = periodRange(period, now);
  const field = spendingField(period);
  const members: RankingMemberInput[] = activeMembers(state, viewer.groupId).map((member) => {
    const records = state.playRecords.filter(
      (record) =>
        record.playerId === member.userId &&
        !record.deletedAt &&
        inRange(new Date(record.playedAt), range),
    );
    const prizes = state.prizes.filter(
      (prize) =>
        prize.ownerMemberId === member.userId &&
        !prize.deletedAt &&
        inRange(new Date(prize.acquiredAt), range),
    );
    const visits = state.visits.filter(
      (visit) =>
        visit.memberId === member.userId &&
        !visit.deletedAt &&
        inRange(new Date(visit.visitedAt), range),
    );
    const revenge = state.revengeTargets.filter(
      (target) =>
        target.assignedMemberId === member.userId &&
        target.status === "COMPLETED" &&
        !target.needsReview &&
        target.completedAt &&
        inRange(new Date(target.completedAt), range),
    );
    const disclosed = spendingComparisonAllowed(state, member.userId, field);
    const spending = disclosed
      ? sumSpending(spendable(state), member.userId, range)
      : null;
    return {
      memberId: member.userId,
      nickname: nickname(state, member.userId),
      attemptCount: records.reduce((total, record) => total + record.attemptCount, 0),
      winCount: records.reduce((total, record) => total + record.winCount, 0),
      prizeCount: prizes.length,
      distinctStoreCount: new Set(visits.map((visit) => visit.storeId)).size,
      completedRevengeCount: revenge.length,
      distinctDesignCount: new Set(prizes.map((prize) => prize.prizeDesignId)).size,
      spending,
    };
  });
  return computeRankings(members, period);
}

export function periodLabel(period: RankingPeriod): string {
  return PERIOD_LABELS[period];
}

export interface VillageView {
  currentLevel: number;
  unlockedLevel: number;
  levelName: string;
  eligibleCount: number;
  blocked: string[];
  characters: Array<{
    id: string;
    prizeId: string;
    ownerMemberId: string;
    ownerNickname: string;
    name: string;
    col: number;
    row: number;
    spriteKind: "pixel" | "placeholder";
    spritePath: string | null;
    introducedAt: string;
  }>;
}

export function villageView(state: ClubState, viewerId: string, clock: Clock): VillageView {
  requireActiveMember(state, viewerId);
  syncVillage(state, clock);
  const village = state.villageState;
  const current = village?.currentLevel ?? 1;
  const unlocked = village?.unlockedLevel ?? 1;
  const rule = villageLevelForCount(
    state.prizes.filter((prize) => canViewPrize(state, viewerId, prize) && prize.visibility === "GROUP").length,
  );
  return {
    currentLevel: current,
    unlockedLevel: unlocked,
    levelName: rule.name,
    eligibleCount: state.villageCharacters.length,
    blocked: [...blockedTilesForLevel(unlocked)],
    characters: state.villageCharacters
      .filter((character) => {
        const prize = state.prizes.find((item) => item.id === character.prizeId);
        return prize ? canViewPrize(state, viewerId, prize) : false;
      })
      .map((character) => {
        const pixel = state.prizeAssets.find(
          (asset) => asset.prizeId === character.prizeId && asset.assetType === "pixel",
        );
        return {
          id: character.id,
          prizeId: character.prizeId,
          ownerMemberId: character.ownerMemberId,
          ownerNickname: nickname(state, character.ownerMemberId),
          name: character.displayName,
          col: character.col,
          row: character.row,
          spriteKind: resolveSpriteKind({
            processingStatus: pixel?.processingStatus ?? null,
            hasPixel: Boolean(pixel),
          }),
          spritePath: character.spritePath,
          introducedAt: character.introducedAt,
        };
      }),
  };
}

export interface PrizeView {
  id: string;
  name: string;
  category: string;
  description: string;
  ownerMemberId: string;
  ownerNickname: string;
  visibility: Prize["visibility"];
  acquiredAt: string;
  storeName: string | null;
  designId: string;
  unlinkNote: string | null;
  originalPath: string | null;
  pixelPath: string | null;
  processingStatus: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED" | null;
  processingError: string | null;
}

export function listPrizeViews(state: ClubState, viewerId: string): PrizeView[] {
  requireActiveMember(state, viewerId);
  return state.prizes
    .filter((prize) => canViewPrize(state, viewerId, prize))
    .map((prize) => prizeView(state, prize))
    .sort((a, b) => b.acquiredAt.localeCompare(a.acquiredAt));
}

function prizeView(state: ClubState, prize: Prize): PrizeView {
  const design = state.prizeDesigns.find((item) => item.id === prize.prizeDesignId);
  const record = prize.acquisitionPlayRecordId
    ? state.playRecords.find((item) => item.id === prize.acquisitionPlayRecordId)
    : undefined;
  const storeId = record ? recordStoreId(state, record) : null;
  const original = state.prizeAssets.find((asset) => asset.prizeId === prize.id && asset.assetType === "original");
  const pixel = state.prizeAssets.find((asset) => asset.prizeId === prize.id && asset.assetType === "pixel");
  const job = [...state.imageJobs].reverse().find((item) => item.prizeId === prize.id);
  return {
    id: prize.id,
    name: prize.name,
    category: design?.category ?? "기타",
    description: prize.description,
    ownerMemberId: prize.ownerMemberId,
    ownerNickname: nickname(state, prize.ownerMemberId),
    visibility: prize.visibility,
    acquiredAt: prize.acquiredAt,
    storeName: storeId ? storeName(state, storeId) : null,
    designId: prize.prizeDesignId,
    unlinkNote: prize.unlinkNote,
    originalPath: original?.storagePath ?? null,
    pixelPath: pixel?.storagePath ?? null,
    processingStatus: job?.status ?? null,
    processingError: job?.errorMessage ?? null,
  };
}

export function getPrizeView(state: ClubState, viewerId: string, prizeId: string): PrizeView | null {
  const prize = state.prizes.find((item) => item.id === prizeId);
  if (!prize || !canViewPrize(state, viewerId, prize)) {
    return null;
  }
  return prizeView(state, prize);
}

export function storeSpending(
  state: ClubState,
  viewerId: string,
  storeId: string,
): DisclosedTotal {
  const viewer = requireActiveMember(state, viewerId);
  const members = activeMembers(state, viewer.groupId);
  const peers: DisclosedTotal["peers"] = [];
  let permitted = 0;
  let hidden = 0;
  for (const member of members) {
    const visible =
      member.userId === viewerId ||
      viewerSharesAmount(state, viewerId, member.userId, "showStoreSpending");
    const spent = state.playRecords
      .filter((record) => record.playerId === member.userId && !record.deletedAt && recordStoreId(state, record) === storeId)
      .reduce((total, record) => total + amountOf(state, record.id), 0);
    if (!visible) {
      hidden += 1;
      continue;
    }
    permitted += spent;
    if (member.userId !== viewerId) {
      peers.push({ memberId: member.userId, nickname: nickname(state, member.userId), spent });
    }
  }
  return {
    coverage: hidden === 0 ? "complete" : "partial",
    permittedSpent: permitted,
    groupTotal: hidden === 0 ? permitted : null,
    peers,
  };
}

export interface MapPlaceView {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  revenge: boolean;
  visited: boolean;
  visitCount: number;
  winCount: number;
  failCount: number;
  spendingLabel: string;
  origin?: "member" | "public";
  clusterCount?: number;
  storeKind?: "CLAW" | "ARCADE" | "UNKNOWN";
  clawPresence?: "YES" | "NO" | "UNKNOWN";
}

export function mapPlaceViews(state: ClubState, viewerId: string): MapPlaceView[] {
  const viewer = requireActiveMember(state, viewerId);
  return state.stores
    .filter((store) => store.groupId === viewer.groupId && !store.deletedAt)
    .map((store) => {
      const visits = state.visits.filter(
        (visit) => visit.groupId === viewer.groupId && visit.storeId === store.id && !visit.deletedAt,
      );
      const records = state.playRecords.filter(
        (record) => record.groupId === viewer.groupId && !record.deletedAt && recordStoreId(state, record) === store.id,
      );
      const attempts = records.reduce((total, record) => total + record.attemptCount, 0);
      const wins = records.reduce((total, record) => total + record.winCount, 0);
      const spending = storeSpending(state, viewerId, store.id);
      const revenge = state.revengeTargets.some(
        (target) => target.groupId === viewer.groupId && target.storeId === store.id && target.status === "ACTIVE" && !target.deletedAt,
      );
      return {
        id: store.id,
        name: store.name,
        address: store.address,
        latitude: store.latitude,
        longitude: store.longitude,
        revenge,
        visited: visits.length > 0,
        visitCount: visits.length,
        winCount: wins,
        failCount: Math.max(0, attempts - wins),
        spendingLabel: spendingLabel(spending, records.length),
      };
    });
}

function spendingLabel(spending: DisclosedTotal, recordCount: number): string {
  if (recordCount === 0) {
    return "지출 기록 없음";
  }
  if (spending.coverage === "complete" && spending.groupTotal !== null) {
    return formatKrw(spending.groupTotal);
  }
  if (spending.permittedSpent > 0) {
    return `공개된 금액 ${formatKrw(spending.permittedSpent)}`;
  }
  return "금액 비공개";
}

export function formatMoneyCell(cell: MoneyCell): string {
  return cell.visible && cell.amount !== null ? formatKrw(cell.amount) : "비공개";
}

export function ownPrivacy(state: ClubState, viewerId: string) {
  requireActiveMember(state, viewerId);
  return privacyOf(state, viewerId);
}
