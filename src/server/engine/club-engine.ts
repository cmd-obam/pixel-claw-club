import { createHash, randomBytes, randomUUID } from "node:crypto";
import { AppError } from "@/domain/errors";
import {
  DEFAULT_WEEKLY_BUDGET_KRW,
  confirmationMatches,
  projectBudget,
  type BudgetProjection,
} from "@/domain/budget";
import { assertPlayCounts, sumSpending, type SpendableRecord } from "@/domain/records";
import {
  decideRevengeCompletion,
  type RevengeStatus,
} from "@/domain/revenge";
import {
  coordinatesAreValid,
  findProbableDuplicate,
} from "@/domain/stores";
import { parseIso, seoulWeekRange } from "@/domain/time";
import {
  eligibleVillagePrizes,
  isWalkable,
  mergeUnlockedLevel,
  uniqueByPrizeId,
  villageLevelForCount,
  blockedTilesForLevel,
} from "@/domain/village";

export type Visibility = "PRIVATE" | "GROUP";
export type MemberStatus = "INVITED" | "ACTIVE" | "REVOKED";
export type MemberRole = "OWNER" | "MEMBER";
export type ProcessingStatus = "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED";
export type AssetType = "original" | "thumbnail" | "pixel" | "sprite";

export interface Group {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Profile {
  id: string;
  nickname: string;
  avatarPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  status: MemberStatus;
  role: MemberRole;
  joinedAt: string | null;
  revokedAt: string | null;
}

export interface Invitation {
  id: string;
  groupId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  usedBy: string | null;
  createdBy: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface Store {
  id: string;
  groupId: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Visit {
  id: string;
  groupId: string;
  storeId: string;
  memberId: string;
  visitedAt: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PlayRecord {
  id: string;
  groupId: string;
  visitId: string;
  playerId: string;
  createdBy: string;
  playedAt: string;
  attemptCount: number;
  winCount: number;
  notes: string;
  machineLabel: string;
  idempotencyKey: string | null;
  payloadHash: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface FinancialRecord {
  id: string;
  playRecordId: string;
  groupId: string;
  ownerMemberId: string;
  amountSpent: number;
  createdAt: string;
  updatedAt: string;
}

export interface PrivacySetting {
  memberId: string;
  groupId: string;
  showTotalSpending: Visibility;
  showWeeklySpending: Visibility;
  showStoreSpending: Visibility;
  showIndividualRecordAmounts: Visibility;
  showMonthlyStatistics: Visibility;
  updatedAt: string;
}

export interface BudgetSetting {
  memberId: string;
  groupId: string;
  weeklyBudgetKrw: number;
  updatedAt: string;
}

export interface RevengeTarget {
  id: string;
  groupId: string;
  storeId: string;
  createdBy: string;
  assignedMemberId: string;
  status: RevengeStatus;
  reason: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  completionPlayRecordId: string | null;
  needsReview: boolean;
  deletedAt: string | null;
}

export interface PrizeDesign {
  id: string;
  groupId: string;
  name: string;
  category: string;
  description: string;
  createdAt: string;
}

export interface Prize {
  id: string;
  groupId: string;
  ownerMemberId: string;
  prizeDesignId: string;
  acquisitionPlayRecordId: string | null;
  acquiredAt: string;
  name: string;
  description: string;
  visibility: Visibility;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  unlinkNote: string | null;
}

export interface PrizeAsset {
  id: string;
  prizeId: string;
  assetType: AssetType;
  storagePath: string;
  processingStatus: ProcessingStatus;
  version: number;
  createdAt: string;
}

export interface ImageJob {
  id: string;
  prizeId: string;
  status: ProcessingStatus;
  version: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VillageState {
  groupId: string;
  currentLevel: number;
  unlockedLevel: number;
  updatedAt: string;
}

export interface VillageCharacter {
  id: string;
  groupId: string;
  prizeId: string;
  ownerMemberId: string;
  displayName: string;
  spritePath: string | null;
  col: number;
  row: number;
  introducedAt: string;
}

export interface AuditEvent {
  id: string;
  groupId: string | null;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
}

export interface NotificationEvent {
  id: string;
  groupId: string;
  recipientId: string;
  message: string;
  createdAt: string;
  readAt: string | null;
}

export interface ClubState {
  groups: Group[];
  profiles: Profile[];
  members: GroupMember[];
  invitations: Invitation[];
  stores: Store[];
  visits: Visit[];
  playRecords: PlayRecord[];
  financialRecords: FinancialRecord[];
  privacySettings: PrivacySetting[];
  budgetSettings: BudgetSetting[];
  revengeTargets: RevengeTarget[];
  prizeDesigns: PrizeDesign[];
  prizes: Prize[];
  prizeAssets: PrizeAsset[];
  imageJobs: ImageJob[];
  villageState: VillageState | null;
  villageCharacters: VillageCharacter[];
  notifications: NotificationEvent[];
  audit: AuditEvent[];
}

export type Clock = () => Date;

export function emptyState(): ClubState {
  return {
    groups: [],
    profiles: [],
    members: [],
    invitations: [],
    stores: [],
    visits: [],
    playRecords: [],
    financialRecords: [],
    privacySettings: [],
    budgetSettings: [],
    revengeTargets: [],
    prizeDesigns: [],
    prizes: [],
    prizeAssets: [],
    imageJobs: [],
    villageState: null,
    villageCharacters: [],
    notifications: [],
    audit: [],
  };
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function activeMembers(state: ClubState, groupId: string): GroupMember[] {
  return state.members.filter((member) => member.groupId === groupId && member.status === "ACTIVE");
}

export function requireActiveMember(state: ClubState, userId: string): GroupMember {
  const member = state.members.find((item) => item.userId === userId && item.status === "ACTIVE");
  if (!member) {
    throw new AppError("FORBIDDEN", "그룹에 참여한 멤버만 사용할 수 있습니다.", 403);
  }
  return member;
}

export function requireOwner(state: ClubState, userId: string): GroupMember {
  const member = requireActiveMember(state, userId);
  if (member.role !== "OWNER") {
    throw new AppError("FORBIDDEN", "방장만 이 작업을 할 수 있습니다.", 403);
  }
  return member;
}

function stamp(clock: Clock): string {
  return clock().toISOString();
}

function audit(
  state: ClubState,
  clock: Clock,
  event: Omit<AuditEvent, "id" | "createdAt">,
): void {
  state.audit.push({ ...event, id: randomUUID(), createdAt: stamp(clock) });
}

function notify(
  state: ClubState,
  clock: Clock,
  groupId: string,
  recipientId: string,
  message: string,
): void {
  state.notifications.push({
    id: randomUUID(),
    groupId,
    recipientId,
    message,
    createdAt: stamp(clock),
    readAt: null,
  });
}

export function ensurePersonalRows(
  state: ClubState,
  member: GroupMember,
  clock: Clock,
): void {
  const at = stamp(clock);
  if (!state.privacySettings.some((row) => row.memberId === member.userId)) {
    state.privacySettings.push({
      memberId: member.userId,
      groupId: member.groupId,
      showTotalSpending: "PRIVATE",
      showWeeklySpending: "PRIVATE",
      showStoreSpending: "PRIVATE",
      showIndividualRecordAmounts: "PRIVATE",
      showMonthlyStatistics: "PRIVATE",
      updatedAt: at,
    });
  }
  if (!state.budgetSettings.some((row) => row.memberId === member.userId)) {
    state.budgetSettings.push({
      memberId: member.userId,
      groupId: member.groupId,
      weeklyBudgetKrw: DEFAULT_WEEKLY_BUDGET_KRW,
      updatedAt: at,
    });
  }
}

export function registerProfile(
  state: ClubState,
  userId: string,
  nickname: string,
  clock: Clock,
): Profile {
  const existing = state.profiles.find((profile) => profile.id === userId);
  if (existing) {
    return existing;
  }
  const at = stamp(clock);
  const profile: Profile = {
    id: userId,
    nickname: nickname.trim() || "새 멤버",
    avatarPath: null,
    createdAt: at,
    updatedAt: at,
  };
  state.profiles.push(profile);
  return profile;
}

export function bootstrapGroup(
  state: ClubState,
  userId: string,
  name: string,
  clock: Clock,
): string {
  if (!state.profiles.some((profile) => profile.id === userId)) {
    throw new AppError("AUTH", "프로필이 없습니다. 다시 로그인해 주세요.", 401);
  }
  if (state.groups.length > 0) {
    throw new AppError("GROUP_EXISTS", "이미 비공개 그룹이 있습니다.");
  }
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 40) {
    throw new AppError("VALIDATION", "그룹 이름은 1자에서 40자 사이여야 합니다.");
  }
  const at = stamp(clock);
  const groupId = randomUUID();
  state.groups.push({
    id: groupId,
    name: trimmed,
    ownerId: userId,
    createdAt: at,
    updatedAt: at,
  });
  const member: GroupMember = {
    id: randomUUID(),
    groupId,
    userId,
    status: "ACTIVE",
    role: "OWNER",
    joinedAt: at,
    revokedAt: null,
  };
  state.members.push(member);
  ensurePersonalRows(state, member, clock);
  state.villageState = {
    groupId,
    currentLevel: 1,
    unlockedLevel: 1,
    updatedAt: at,
  };
  audit(state, clock, {
    groupId,
    actorId: userId,
    action: "group_bootstrapped",
    entityType: "groups",
    entityId: groupId,
  });
  return groupId;
}

export function privacyOf(state: ClubState, memberId: string): PrivacySetting {
  const row = state.privacySettings.find((item) => item.memberId === memberId);
  if (!row) {
    throw new AppError("DATABASE", "공개 설정을 찾을 수 없습니다.");
  }
  return row;
}

function budgetOf(state: ClubState, memberId: string): BudgetSetting {
  const row = state.budgetSettings.find((item) => item.memberId === memberId);
  if (!row) {
    throw new AppError("DATABASE", "예산 설정을 찾을 수 없습니다.");
  }
  return row;
}

export function viewerSharesAmount(
  state: ClubState,
  viewerId: string,
  ownerId: string,
  field: keyof Pick<
    PrivacySetting,
    | "showTotalSpending"
    | "showWeeklySpending"
    | "showStoreSpending"
    | "showIndividualRecordAmounts"
    | "showMonthlyStatistics"
  >,
): boolean {
  if (viewerId === ownerId) {
    return true;
  }
  const viewer = requireActiveMember(state, viewerId);
  const owner = state.members.find(
    (member) => member.userId === ownerId && member.groupId === viewer.groupId && member.status === "ACTIVE",
  );
  if (!owner) {
    return false;
  }
  return privacyOf(state, ownerId)[field] === "GROUP";
}

/** Ranking comparison is opt-in. A private setting excludes even the viewer. */
export function spendingComparisonAllowed(
  state: ClubState,
  ownerId: string,
  field: "showTotalSpending" | "showWeeklySpending" | "showMonthlyStatistics",
): boolean {
  return privacyOf(state, ownerId)[field] === "GROUP";
}

function spendable(state: ClubState): SpendableRecord[] {
  return state.playRecords.map((record) => ({
    id: record.id,
    playerId: record.playerId,
    playedAt: record.playedAt,
    deletedAt: record.deletedAt,
    amountSpent:
      state.financialRecords.find((row) => row.playRecordId === record.id)?.amountSpent ?? 0,
  }));
}

function weekProjection(
  state: ClubState,
  memberId: string,
  playedAt: Date,
  amount: number,
  excludeId: string | null,
): BudgetProjection {
  const range = seoulWeekRange(playedAt);
  const spentBefore = sumSpending(spendable(state), memberId, range, excludeId);
  const budget = budgetOf(state, memberId).weeklyBudgetKrw;
  return projectBudget({
    memberId,
    weekStartIso: range.start.toISOString(),
    spentBefore,
    amount,
    budget,
    recordId: excludeId,
  });
}

export interface PrizeDraft {
  name: string;
  category: string;
  description: string;
  visibility: Visibility;
}

export interface SavePlayInput {
  storeId: string;
  visitId: string | null;
  newVisit: boolean;
  playedAt: string;
  attemptCount: number;
  winCount: number;
  amountSpent: number;
  machineLabel: string;
  notes: string;
  prizes: PrizeDraft[];
  idempotencyKey: string;
  confirmFingerprint: string | null;
}

export type SavePlayResult =
  | { status: "saved"; recordId: string; idempotent: boolean }
  | { status: "confirmation_required"; projection: BudgetProjection };

function playPayloadHash(input: SavePlayInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        storeId: input.storeId,
        playedAt: input.playedAt,
        attemptCount: input.attemptCount,
        winCount: input.winCount,
        amountSpent: input.amountSpent,
        machineLabel: input.machineLabel,
        notes: input.notes,
        prizes: input.prizes,
      }),
    )
    .digest("hex");
}

function assertAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount < 0 || amount > 10_000_000) {
    throw new AppError("VALIDATION", "지출 금액은 0원 이상의 정수여야 합니다.");
  }
}

function storeOf(state: ClubState, groupId: string, storeId: string): Store {
  const store = state.stores.find((item) => item.id === storeId && item.groupId === groupId && !item.deletedAt);
  if (!store) {
    throw new AppError("NOT_FOUND", "매장을 찾을 수 없습니다.", 404);
  }
  return store;
}

function designFor(state: ClubState, groupId: string, draft: PrizeDraft, clock: Clock): PrizeDesign {
  const name = draft.name.trim();
  const existing = state.prizeDesigns.find(
    (design) => design.groupId === groupId && design.name.toLowerCase() === name.toLowerCase(),
  );
  if (existing) {
    return existing;
  }
  const created: PrizeDesign = {
    id: randomUUID(),
    groupId,
    name,
    category: draft.category.trim() || "기타",
    description: draft.description.trim(),
    createdAt: stamp(clock),
  };
  state.prizeDesigns.push(created);
  return created;
}

export function syncVillage(state: ClubState, clock: Clock): void {
  const group = state.groups[0];
  if (!group) {
    return;
  }
  const eligible = eligibleVillagePrizes(state.prizes.filter((prize) => prize.groupId === group.id));
  const level = villageLevelForCount(eligible.length);
  const blocked = blockedTilesForLevel(
    mergeUnlockedLevel(state.villageState?.unlockedLevel ?? 1, level.level),
  );
  const at = stamp(clock);
  if (!state.villageState) {
    state.villageState = {
      groupId: group.id,
      currentLevel: level.level,
      unlockedLevel: level.level,
      updatedAt: at,
    };
  } else {
    state.villageState.currentLevel = level.level;
    state.villageState.unlockedLevel = mergeUnlockedLevel(
      state.villageState.unlockedLevel,
      level.level,
    );
    state.villageState.updatedAt = at;
  }
  const eligibleIds = new Set(eligible.map((prize) => prize.id));
  state.villageCharacters = uniqueByPrizeId(
    state.villageCharacters.filter((character) => eligibleIds.has(character.prizeId)),
  );
  let slot = 0;
  for (const prize of eligible) {
    const existing = state.villageCharacters.find((character) => character.prizeId === prize.id);
    const pixel = state.prizeAssets.find(
      (asset) =>
        asset.prizeId === prize.id &&
        asset.assetType === "pixel" &&
        asset.processingStatus === "SUCCEEDED",
    );
    if (existing) {
      existing.displayName = prize.name;
      existing.ownerMemberId = prize.ownerMemberId;
      existing.spritePath = pixel?.storagePath ?? null;
      continue;
    }
    let col = (slot * 2) % 14;
    let row = 8 + (slot % 2);
    if (!isWalkable(col, row, blocked)) {
      col = 0;
      row = 9;
    }
    slot += 1;
    state.villageCharacters.push({
      id: prize.id,
      groupId: group.id,
      prizeId: prize.id,
      ownerMemberId: prize.ownerMemberId,
      displayName: prize.name,
      spritePath: pixel?.storagePath ?? null,
      col,
      row,
      introducedAt: at,
    });
  }
}

function addPrizesForRecord(
  state: ClubState,
  member: GroupMember,
  record: PlayRecord,
  drafts: PrizeDraft[],
  clock: Clock,
): void {
  if (drafts.length > record.winCount) {
    throw new AppError("VALIDATION", "등록하는 인형 수는 성공 횟수를 넘을 수 없습니다.");
  }
  for (const draft of drafts) {
    const name = draft.name.trim();
    if (name.length < 1) {
      throw new AppError("VALIDATION", "인형 이름을 입력해 주세요.");
    }
    const design = designFor(state, member.groupId, draft, clock);
    const at = stamp(clock);
    state.prizes.push({
      id: randomUUID(),
      groupId: member.groupId,
      ownerMemberId: member.userId,
      prizeDesignId: design.id,
      acquisitionPlayRecordId: record.id,
      acquiredAt: record.playedAt,
      name,
      description: draft.description.trim(),
      visibility: draft.visibility,
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
      unlinkNote: null,
    });
  }
}

export function savePlayRecord(
  state: ClubState,
  actorId: string,
  input: SavePlayInput,
  clock: Clock,
): SavePlayResult {
  const member = requireActiveMember(state, actorId);
  ensurePersonalRows(state, member, clock);
  const hash = playPayloadHash(input);
  const existing = state.playRecords.find(
    (record) => record.createdBy === actorId && record.idempotencyKey === input.idempotencyKey,
  );
  if (existing) {
    if (existing.payloadHash !== hash) {
      throw new AppError("DUPLICATE", "이미 처리된 요청과 내용이 다릅니다. 새로 작성해 주세요.");
    }
    return { status: "saved", recordId: existing.id, idempotent: true };
  }
  try {
    assertPlayCounts(input.attemptCount, input.winCount);
  } catch {
    throw new AppError("VALIDATION", "시도 횟수와 성공 횟수를 확인해 주세요.");
  }
  assertAmount(input.amountSpent);
  const playedAt = parseIso(input.playedAt);
  storeOf(state, member.groupId, input.storeId);
  let visitId = input.visitId;
  if (visitId) {
    const visit = state.visits.find((item) => item.id === visitId && !item.deletedAt);
    if (!visit || visit.groupId !== member.groupId || visit.memberId !== actorId || visit.storeId !== input.storeId) {
      throw new AppError("VALIDATION", "선택한 방문 기록이 이 매장과 맞지 않습니다.");
    }
  } else if (!input.newVisit) {
    throw new AppError("VALIDATION", "방문을 선택하거나 새 방문을 만들어 주세요.");
  }
  const projection = weekProjection(state, actorId, playedAt, input.amountSpent, null);
  if (!confirmationMatches(projection, input.confirmFingerprint)) {
    return { status: "confirmation_required", projection };
  }
  const at = stamp(clock);
  if (!visitId) {
    visitId = randomUUID();
    state.visits.push({
      id: visitId,
      groupId: member.groupId,
      storeId: input.storeId,
      memberId: actorId,
      visitedAt: playedAt.toISOString(),
      notes: "",
      createdBy: actorId,
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    });
  }
  const record: PlayRecord = {
    id: randomUUID(),
    groupId: member.groupId,
    visitId,
    playerId: actorId,
    createdBy: actorId,
    playedAt: playedAt.toISOString(),
    attemptCount: input.attemptCount,
    winCount: input.winCount,
    notes: input.notes.trim(),
    machineLabel: input.machineLabel.trim(),
    idempotencyKey: input.idempotencyKey,
    payloadHash: hash,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  };
  state.playRecords.push(record);
  state.financialRecords.push({
    id: randomUUID(),
    playRecordId: record.id,
    groupId: member.groupId,
    ownerMemberId: actorId,
    amountSpent: input.amountSpent,
    createdAt: at,
    updatedAt: at,
  });
  addPrizesForRecord(state, member, record, input.prizes, clock);
  syncVillage(state, clock);
  audit(state, clock, {
    groupId: member.groupId,
    actorId,
    action: "play_record_saved",
    entityType: "play_records",
    entityId: record.id,
  });
  return { status: "saved", recordId: record.id, idempotent: false };
}

export interface UpdatePlayInput {
  recordId: string;
  playedAt: string;
  attemptCount: number;
  winCount: number;
  amountSpent: number;
  machineLabel: string;
  notes: string;
  confirmFingerprint: string | null;
}

export function updatePlayRecord(
  state: ClubState,
  actorId: string,
  input: UpdatePlayInput,
  clock: Clock,
): SavePlayResult {
  const member = requireActiveMember(state, actorId);
  const record = state.playRecords.find((item) => item.id === input.recordId && !item.deletedAt);
  if (!record || record.groupId !== member.groupId) {
    throw new AppError("NOT_FOUND", "플레이 기록을 찾을 수 없습니다.", 404);
  }
  if (record.playerId !== actorId) {
    throw new AppError("FORBIDDEN", "다른 멤버의 기록은 수정할 수 없습니다.", 403);
  }
  try {
    assertPlayCounts(input.attemptCount, input.winCount);
  } catch {
    throw new AppError("VALIDATION", "시도 횟수와 성공 횟수를 확인해 주세요.");
  }
  assertAmount(input.amountSpent);
  const linked = state.prizes.filter(
    (prize) => prize.acquisitionPlayRecordId === record.id && !prize.deletedAt,
  ).length;
  if (input.winCount < linked) {
    throw new AppError(
      "PRIZE_LINK",
      "연결된 인형 수보다 성공 횟수를 줄일 수 없습니다. 인형 연결을 먼저 정리해 주세요.",
    );
  }
  const playedAt = parseIso(input.playedAt);
  const projection = weekProjection(state, actorId, playedAt, input.amountSpent, record.id);
  if (!confirmationMatches(projection, input.confirmFingerprint)) {
    return { status: "confirmation_required", projection };
  }
  const finance = state.financialRecords.find((row) => row.playRecordId === record.id);
  if (!finance || finance.ownerMemberId !== actorId) {
    throw new AppError("DATABASE", "지출 기록을 찾을 수 없습니다.");
  }
  record.playedAt = playedAt.toISOString();
  record.attemptCount = input.attemptCount;
  record.winCount = input.winCount;
  record.machineLabel = input.machineLabel.trim();
  record.notes = input.notes.trim();
  record.updatedAt = stamp(clock);
  finance.amountSpent = input.amountSpent;
  finance.updatedAt = record.updatedAt;
  audit(state, clock, {
    groupId: member.groupId,
    actorId,
    action: "play_record_updated",
    entityType: "play_records",
    entityId: record.id,
  });
  return { status: "saved", recordId: record.id, idempotent: false };
}

export function setPlayRecordDeleted(
  state: ClubState,
  actorId: string,
  recordId: string,
  deleted: boolean,
  confirmFingerprint: string | null,
  clock: Clock,
): SavePlayResult {
  const member = requireActiveMember(state, actorId);
  const record = state.playRecords.find((item) => item.id === recordId && item.groupId === member.groupId);
  if (!record) {
    throw new AppError("NOT_FOUND", "플레이 기록을 찾을 수 없습니다.", 404);
  }
  if (record.playerId !== actorId) {
    throw new AppError("FORBIDDEN", "다른 멤버의 기록은 삭제할 수 없습니다.", 403);
  }
  if (!deleted) {
    if (!record.deletedAt) {
      return { status: "saved", recordId: record.id, idempotent: true };
    }
    const finance = state.financialRecords.find((row) => row.playRecordId === record.id);
    const projection = weekProjection(
      state,
      actorId,
      parseIso(record.playedAt),
      finance?.amountSpent ?? 0,
      record.id,
    );
    if (!confirmationMatches(projection, confirmFingerprint)) {
      return { status: "confirmation_required", projection };
    }
    record.deletedAt = null;
    record.updatedAt = stamp(clock);
    return { status: "saved", recordId: record.id, idempotent: false };
  }
  if (record.deletedAt) {
    return { status: "saved", recordId: record.id, idempotent: true };
  }
  record.deletedAt = stamp(clock);
  record.updatedAt = record.deletedAt;
  for (const prize of state.prizes) {
    if (prize.acquisitionPlayRecordId === record.id) {
      prize.acquisitionPlayRecordId = null;
      prize.unlinkNote = "기록 삭제로 획득 연결이 해제되었습니다. 인형은 삭제되지 않았습니다.";
      prize.updatedAt = record.deletedAt;
    }
  }
  for (const target of state.revengeTargets) {
    if (target.completionPlayRecordId === record.id && target.status === "COMPLETED") {
      target.needsReview = true;
      target.updatedAt = record.deletedAt;
    }
  }
  audit(state, clock, {
    groupId: member.groupId,
    actorId,
    action: "play_record_deleted",
    entityType: "play_records",
    entityId: record.id,
  });
  return { status: "saved", recordId: record.id, idempotent: false };
}

export function createInvitation(
  state: ClubState,
  actorId: string,
  clock: Clock,
): { invitationId: string; token: string; expiresAt: string } {
  const member = requireOwner(state, actorId);
  const token = generateInvitationToken();
  const expires = new Date(clock().getTime() + 1000 * 60 * 60 * 24 * 7);
  const invitation: Invitation = {
    id: randomUUID(),
    groupId: member.groupId,
    tokenHash: hashInvitationToken(token),
    expiresAt: expires.toISOString(),
    usedAt: null,
    usedBy: null,
    createdBy: actorId,
    revokedAt: null,
    createdAt: stamp(clock),
  };
  state.invitations.push(invitation);
  audit(state, clock, {
    groupId: member.groupId,
    actorId,
    action: "invitation_created",
    entityType: "group_invitations",
    entityId: invitation.id,
  });
  return { invitationId: invitation.id, token, expiresAt: invitation.expiresAt };
}

export function revokeInvitation(
  state: ClubState,
  actorId: string,
  invitationId: string,
  clock: Clock,
): void {
  const member = requireOwner(state, actorId);
  const invitation = state.invitations.find((item) => item.id === invitationId && item.groupId === member.groupId);
  if (!invitation) {
    throw new AppError("NOT_FOUND", "초대를 찾을 수 없습니다.", 404);
  }
  if (!invitation.revokedAt && !invitation.usedAt) {
    invitation.revokedAt = stamp(clock);
  }
}

export function acceptInvitation(
  state: ClubState,
  actorId: string,
  token: string,
  clock: Clock,
): string {
  if (!state.profiles.some((profile) => profile.id === actorId)) {
    throw new AppError("AUTH", "로그인이 필요합니다.", 401);
  }
  const tokenHash = hashInvitationToken(token);
  const invitation = state.invitations.find((item) => item.tokenHash === tokenHash);
  if (!invitation) {
    throw new AppError("INVITE_INVALID", "초대가 유효하지 않습니다.");
  }
  if (invitation.usedAt) {
    throw new AppError("INVITE_USED", "이미 사용된 초대입니다.");
  }
  if (invitation.revokedAt) {
    throw new AppError("INVITE_REVOKED", "취소된 초대입니다.");
  }
  if (parseIso(invitation.expiresAt).getTime() <= clock().getTime()) {
    invitation.revokedAt = stamp(clock);
    throw new AppError("INVITE_EXPIRED", "만료된 초대입니다.");
  }
  const existing = state.members.find(
    (member) => member.groupId === invitation.groupId && member.userId === actorId,
  );
  if (existing?.status === "ACTIVE") {
    throw new AppError("INVITE_USED", "이미 그룹에 참여하고 있습니다.");
  }
  const activeCount = activeMembers(state, invitation.groupId).length;
  if (activeCount >= 3) {
    throw new AppError("GROUP_FULL", "활성 멤버는 세 명까지입니다.");
  }
  const at = stamp(clock);
  if (existing) {
    existing.status = "ACTIVE";
    existing.joinedAt = at;
    existing.revokedAt = null;
    ensurePersonalRows(state, existing, clock);
  } else {
    const member: GroupMember = {
      id: randomUUID(),
      groupId: invitation.groupId,
      userId: actorId,
      status: "ACTIVE",
      role: "MEMBER",
      joinedAt: at,
      revokedAt: null,
    };
    state.members.push(member);
    ensurePersonalRows(state, member, clock);
  }
  invitation.usedAt = at;
  invitation.usedBy = actorId;
  const owner = state.members.find((member) => member.groupId === invitation.groupId && member.role === "OWNER");
  if (owner) {
    notify(state, clock, invitation.groupId, owner.userId, "새 멤버가 초대를 수락했습니다.");
  }
  audit(state, clock, {
    groupId: invitation.groupId,
    actorId,
    action: "invitation_accepted",
    entityType: "group_invitations",
    entityId: invitation.id,
  });
  return invitation.groupId;
}

export function revokeMember(
  state: ClubState,
  actorId: string,
  targetUserId: string,
  clock: Clock,
): void {
  const owner = requireOwner(state, actorId);
  if (targetUserId === actorId) {
    throw new AppError("VALIDATION", "방장 자신은 내보낼 수 없습니다.");
  }
  const target = state.members.find(
    (member) => member.groupId === owner.groupId && member.userId === targetUserId && member.status === "ACTIVE",
  );
  if (!target) {
    throw new AppError("NOT_FOUND", "멤버를 찾을 수 없습니다.", 404);
  }
  target.status = "REVOKED";
  target.revokedAt = stamp(clock);
  audit(state, clock, {
    groupId: owner.groupId,
    actorId,
    action: "member_revoked",
    entityType: "group_members",
    entityId: target.id,
  });
}

export function updateProfile(
  state: ClubState,
  actorId: string,
  nickname: string,
  clock: Clock,
): void {
  const profile = state.profiles.find((item) => item.id === actorId);
  if (!profile) {
    throw new AppError("AUTH", "프로필이 없습니다.", 401);
  }
  const trimmed = nickname.trim();
  if (trimmed.length < 1 || trimmed.length > 20) {
    throw new AppError("VALIDATION", "닉네임은 1자에서 20자 사이여야 합니다.");
  }
  profile.nickname = trimmed;
  profile.updatedAt = stamp(clock);
}

export function updateAvatar(state: ClubState, actorId: string, avatarPath: string, clock: Clock): void {
  const profile = state.profiles.find((item) => item.id === actorId);
  if (!profile) {
    throw new AppError("AUTH", "프로필이 없습니다.", 401);
  }
  profile.avatarPath = avatarPath;
  profile.updatedAt = stamp(clock);
}

export function updatePrivacy(
  state: ClubState,
  actorId: string,
  patch: Partial<
    Pick<
      PrivacySetting,
      | "showTotalSpending"
      | "showWeeklySpending"
      | "showStoreSpending"
      | "showIndividualRecordAmounts"
      | "showMonthlyStatistics"
    >
  >,
  clock: Clock,
): void {
  const member = requireActiveMember(state, actorId);
  ensurePersonalRows(state, member, clock);
  const row = privacyOf(state, actorId);
  const allowed: Visibility[] = ["PRIVATE", "GROUP"];
  for (const [key, value] of Object.entries(patch) as Array<[keyof typeof patch, Visibility | undefined]>) {
    if (value === undefined) {
      continue;
    }
    if (!allowed.includes(value)) {
      throw new AppError("VALIDATION", "공개 범위는 나만 보기 또는 그룹 공개만 선택할 수 있습니다.");
    }
    row[key] = value;
  }
  row.updatedAt = stamp(clock);
}

export function updateWeeklyBudget(
  state: ClubState,
  actorId: string,
  amount: number,
  clock: Clock,
): void {
  const member = requireActiveMember(state, actorId);
  ensurePersonalRows(state, member, clock);
  assertAmount(amount);
  const row = budgetOf(state, actorId);
  row.weeklyBudgetKrw = amount;
  row.updatedAt = stamp(clock);
}

export interface StoreInput {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  notes: string;
  acknowledgeDuplicate: boolean;
}

export function createStore(
  state: ClubState,
  actorId: string,
  input: StoreInput,
  clock: Clock,
): Store {
  const member = requireActiveMember(state, actorId);
  if (!coordinatesAreValid(input.latitude, input.longitude)) {
    throw new AppError("VALIDATION", "위도와 경도를 함께, 올바른 범위로 입력해 주세요.");
  }
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) {
    throw new AppError("VALIDATION", "매장 이름을 입력해 주세요.");
  }
  const duplicate = findProbableDuplicate(state.stores.filter((store) => store.groupId === member.groupId), {
    name,
    address: input.address,
    latitude: input.latitude,
    longitude: input.longitude,
  });
  if (duplicate && !input.acknowledgeDuplicate) {
    throw new AppError(
      "DUPLICATE_STORE",
      `가까운 매장 '${duplicate.name}'과 겹쳐 보입니다. 다른 매장이 맞다면 확인 후 저장해 주세요.`,
    );
  }
  const at = stamp(clock);
  const store: Store = {
    id: randomUUID(),
    groupId: member.groupId,
    name,
    address: input.address.trim(),
    latitude: input.latitude,
    longitude: input.longitude,
    notes: input.notes.trim(),
    createdBy: actorId,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  };
  state.stores.push(store);
  return store;
}

export function updateStore(
  state: ClubState,
  actorId: string,
  storeId: string,
  input: StoreInput,
  clock: Clock,
): Store {
  const member = requireActiveMember(state, actorId);
  const store = state.stores.find((item) => item.id === storeId && item.groupId === member.groupId && !item.deletedAt);
  if (!store) {
    throw new AppError("NOT_FOUND", "매장을 찾을 수 없습니다.", 404);
  }
  if (store.createdBy !== actorId && member.role !== "OWNER") {
    throw new AppError("FORBIDDEN", "매장 등록자 또는 방장만 수정할 수 있습니다.", 403);
  }
  if (!coordinatesAreValid(input.latitude, input.longitude)) {
    throw new AppError("VALIDATION", "위도와 경도를 함께, 올바른 범위로 입력해 주세요.");
  }
  const duplicate = findProbableDuplicate(
    state.stores.filter((item) => item.groupId === member.groupId),
    input,
    store.id,
  );
  if (duplicate && !input.acknowledgeDuplicate) {
    throw new AppError("DUPLICATE_STORE", `가까운 매장 '${duplicate.name}'과 겹쳐 보입니다.`);
  }
  store.name = input.name.trim();
  store.address = input.address.trim();
  store.latitude = input.latitude;
  store.longitude = input.longitude;
  store.notes = input.notes.trim();
  store.updatedAt = stamp(clock);
  return store;
}

export interface RevengeInput {
  storeId: string;
  assignedMemberId: string;
  reason: string;
  notes: string;
}

export function createRevenge(
  state: ClubState,
  actorId: string,
  input: RevengeInput,
  clock: Clock,
): RevengeTarget {
  const member = requireActiveMember(state, actorId);
  storeOf(state, member.groupId, input.storeId);
  const assigned = activeMembers(state, member.groupId).find((item) => item.userId === input.assignedMemberId);
  if (!assigned) {
    throw new AppError("VALIDATION", "담당 멤버가 같은 그룹의 활성 멤버가 아닙니다.");
  }
  const duplicate = state.revengeTargets.find(
    (target) =>
      !target.deletedAt &&
      target.status === "ACTIVE" &&
      target.storeId === input.storeId &&
      target.assignedMemberId === input.assignedMemberId,
  );
  if (duplicate) {
    throw new AppError("DUPLICATE", "이 멤버와 매장에는 이미 진행 중인 복수 목표가 있습니다.");
  }
  const at = stamp(clock);
  const target: RevengeTarget = {
    id: randomUUID(),
    groupId: member.groupId,
    storeId: input.storeId,
    createdBy: actorId,
    assignedMemberId: input.assignedMemberId,
    status: "ACTIVE",
    reason: input.reason.trim(),
    notes: input.notes.trim(),
    createdAt: at,
    updatedAt: at,
    completedAt: null,
    completionPlayRecordId: null,
    needsReview: false,
    deletedAt: null,
  };
  state.revengeTargets.push(target);
  return target;
}

function canEditRevenge(member: GroupMember, target: RevengeTarget): boolean {
  return (
    target.createdBy === member.userId ||
    target.assignedMemberId === member.userId ||
    member.role === "OWNER"
  );
}

export function abandonRevenge(state: ClubState, actorId: string, targetId: string, clock: Clock): void {
  const member = requireActiveMember(state, actorId);
  const target = state.revengeTargets.find((item) => item.id === targetId && item.groupId === member.groupId);
  if (!target || target.deletedAt) {
    throw new AppError("NOT_FOUND", "복수 목표를 찾을 수 없습니다.", 404);
  }
  if (!canEditRevenge(member, target)) {
    throw new AppError("FORBIDDEN", "이 복수 목표를 수정할 수 없습니다.", 403);
  }
  if (target.status !== "ACTIVE") {
    throw new AppError("VALIDATION", "진행 중인 목표만 중단할 수 있습니다.");
  }
  target.status = "ABANDONED";
  target.updatedAt = stamp(clock);
}

export function completeRevenge(
  state: ClubState,
  actorId: string,
  targetId: string,
  recordId: string,
  confirm: boolean,
  clock: Clock,
): { idempotent: boolean } {
  if (!confirm) {
    throw new AppError("CONFIRM", "성공 기록만으로 자동 완료되지 않습니다. 완료를 확인해 주세요.");
  }
  const member = requireActiveMember(state, actorId);
  const target = state.revengeTargets.find((item) => item.id === targetId && item.groupId === member.groupId && !item.deletedAt);
  if (!target) {
    throw new AppError("NOT_FOUND", "복수 목표를 찾을 수 없습니다.", 404);
  }
  if (!canEditRevenge(member, target)) {
    throw new AppError("FORBIDDEN", "이 복수 목표를 완료할 수 없습니다.", 403);
  }
  const record = state.playRecords.find((item) => item.id === recordId && item.groupId === member.groupId);
  const visit = record ? state.visits.find((item) => item.id === record.visitId) : undefined;
  const statusForDecision =
    target.needsReview && target.status === "COMPLETED" ? "ACTIVE" : target.status;
  const decision = decideRevengeCompletion({
    targetStoreId: target.storeId,
    targetStatus: statusForDecision,
    assignedMemberId: target.assignedMemberId,
    alreadyCompletedRecordId: target.completionPlayRecordId,
    now: clock(),
    record: record
      ? {
          id: record.id,
          storeId: visit?.storeId ?? "",
          playerId: record.playerId,
          winCount: record.winCount,
          deletedAt: record.deletedAt,
          playedAt: parseIso(record.playedAt),
        }
      : null,
  });
  if (!decision.ok) {
    throw new AppError("VALIDATION", decision.message);
  }
  if (!decision.idempotent) {
    target.status = "COMPLETED";
    target.completedAt = decision.completedAt.toISOString();
    target.completionPlayRecordId = recordId;
    target.needsReview = false;
    target.updatedAt = target.completedAt;
  } else if (target.needsReview) {
    target.needsReview = false;
    target.updatedAt = stamp(clock);
  }
  return { idempotent: decision.idempotent };
}

export interface PrizeInput {
  name: string;
  category: string;
  description: string;
  visibility: Visibility;
  acquisitionPlayRecordId: string | null;
}

export function createPrize(
  state: ClubState,
  actorId: string,
  input: PrizeInput,
  clock: Clock,
): Prize {
  const member = requireActiveMember(state, actorId);
  const name = input.name.trim();
  if (name.length < 1) {
    throw new AppError("VALIDATION", "인형 이름을 입력해 주세요.");
  }
  if (input.acquisitionPlayRecordId) {
    const record = state.playRecords.find((item) => item.id === input.acquisitionPlayRecordId && !item.deletedAt);
    if (!record || record.playerId !== actorId || record.groupId !== member.groupId) {
      throw new AppError("VALIDATION", "내 성공 기록에만 인형을 연결할 수 있습니다.");
    }
    const linked = state.prizes.filter(
      (prize) => prize.acquisitionPlayRecordId === record.id && !prize.deletedAt,
    ).length;
    if (linked + 1 > record.winCount) {
      throw new AppError("PRIZE_LINK", "이 기록의 성공 횟수보다 많은 인형을 연결할 수 없습니다.");
    }
  }
  const design = designFor(
    state,
    member.groupId,
    {
      name,
      category: input.category,
      description: input.description,
      visibility: input.visibility,
    },
    clock,
  );
  const at = stamp(clock);
  const prize: Prize = {
    id: randomUUID(),
    groupId: member.groupId,
    ownerMemberId: actorId,
    prizeDesignId: design.id,
    acquisitionPlayRecordId: input.acquisitionPlayRecordId,
    acquiredAt: at,
    name,
    description: input.description.trim(),
    visibility: input.visibility,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    unlinkNote: null,
  };
  state.prizes.push(prize);
  syncVillage(state, clock);
  return prize;
}

export function updatePrize(
  state: ClubState,
  actorId: string,
  prizeId: string,
  input: PrizeInput,
  clock: Clock,
): Prize {
  const member = requireActiveMember(state, actorId);
  const prize = state.prizes.find((item) => item.id === prizeId && !item.deletedAt);
  if (!prize || prize.groupId !== member.groupId) {
    throw new AppError("NOT_FOUND", "인형을 찾을 수 없습니다.", 404);
  }
  if (prize.ownerMemberId !== actorId) {
    throw new AppError("FORBIDDEN", "다른 멤버의 인형은 수정할 수 없습니다.", 403);
  }
  prize.name = input.name.trim();
  prize.description = input.description.trim();
  prize.visibility = input.visibility;
  prize.updatedAt = stamp(clock);
  const design = state.prizeDesigns.find((item) => item.id === prize.prizeDesignId);
  if (design && design.name.toLowerCase() === prize.name.toLowerCase()) {
    design.category = input.category.trim() || design.category;
  }
  syncVillage(state, clock);
  return prize;
}

export function deletePrize(state: ClubState, actorId: string, prizeId: string, clock: Clock): void {
  const member = requireActiveMember(state, actorId);
  const prize = state.prizes.find((item) => item.id === prizeId && item.groupId === member.groupId && !item.deletedAt);
  if (!prize) {
    throw new AppError("NOT_FOUND", "인형을 찾을 수 없습니다.", 404);
  }
  if (prize.ownerMemberId !== actorId) {
    throw new AppError("FORBIDDEN", "다른 멤버의 인형은 삭제할 수 없습니다.", 403);
  }
  prize.deletedAt = stamp(clock);
  syncVillage(state, clock);
}

export function canViewPrize(state: ClubState, viewerId: string, prize: Prize): boolean {
  if (prize.deletedAt) {
    return false;
  }
  if (prize.ownerMemberId === viewerId) {
    return true;
  }
  try {
    const viewer = requireActiveMember(state, viewerId);
    return prize.groupId === viewer.groupId && prize.visibility === "GROUP";
  } catch {
    return false;
  }
}

export function attachOriginalAsset(
  state: ClubState,
  actorId: string,
  prizeId: string,
  storagePath: string,
  clock: Clock,
): ImageJob {
  const prize = state.prizes.find((item) => item.id === prizeId && !item.deletedAt);
  if (!prize || prize.ownerMemberId !== actorId) {
    throw new AppError("FORBIDDEN", "이 인형의 사진을 올릴 수 없습니다.", 403);
  }
  const original = state.prizeAssets.find((asset) => asset.prizeId === prizeId && asset.assetType === "original");
  if (original) {
    throw new AppError("PHOTO", "원본 사진은 이미 보관되어 있어 덮어쓰지 않습니다. 픽셀 이미지만 다시 만들 수 있습니다.");
  }
  const at = stamp(clock);
  state.prizeAssets.push({
    id: randomUUID(),
    prizeId,
    assetType: "original",
    storagePath,
    processingStatus: "SUCCEEDED",
    version: 1,
    createdAt: at,
  });
  const job: ImageJob = {
    id: randomUUID(),
    prizeId,
    status: "PROCESSING",
    version: 1,
    errorMessage: null,
    createdAt: at,
    updatedAt: at,
  };
  state.imageJobs.push(job);
  return job;
}

export function retryPixelJob(state: ClubState, actorId: string, prizeId: string, clock: Clock): ImageJob {
  const prize = state.prizes.find((item) => item.id === prizeId && !item.deletedAt);
  if (!prize || prize.ownerMemberId !== actorId) {
    throw new AppError("FORBIDDEN", "이 인형의 이미지를 다시 만들 수 없습니다.", 403);
  }
  const original = state.prizeAssets.find((asset) => asset.prizeId === prizeId && asset.assetType === "original");
  if (!original) {
    throw new AppError("PHOTO", "다시 만들 원본 사진이 없습니다.");
  }
  const version = Math.max(0, ...state.imageJobs.filter((job) => job.prizeId === prizeId).map((job) => job.version)) + 1;
  const at = stamp(clock);
  const job: ImageJob = {
    id: randomUUID(),
    prizeId,
    status: "PROCESSING",
    version,
    errorMessage: null,
    createdAt: at,
    updatedAt: at,
  };
  state.imageJobs.push(job);
  return job;
}

export function completePixelJob(
  state: ClubState,
  actorId: string,
  jobId: string,
  paths: { thumbnail: string; pixel: string },
  clock: Clock,
): void {
  const job = state.imageJobs.find((item) => item.id === jobId);
  const prize = job ? state.prizes.find((item) => item.id === job.prizeId) : undefined;
  if (!job || !prize || prize.ownerMemberId !== actorId) {
    throw new AppError("FORBIDDEN", "이미지 작업을 마칠 수 없습니다.", 403);
  }
  const original = state.prizeAssets.find((asset) => asset.prizeId === prize.id && asset.assetType === "original");
  const originalPath = original?.storagePath;
  const at = stamp(clock);
  const upsert = (assetType: "thumbnail" | "pixel", storagePath: string) => {
    const current = state.prizeAssets.find((asset) => asset.prizeId === prize.id && asset.assetType === assetType);
    if (current) {
      current.storagePath = storagePath;
      current.processingStatus = "SUCCEEDED";
      current.version = job.version;
      return;
    }
    state.prizeAssets.push({
      id: randomUUID(),
      prizeId: prize.id,
      assetType,
      storagePath,
      processingStatus: "SUCCEEDED",
      version: job.version,
      createdAt: at,
    });
  };
  upsert("thumbnail", paths.thumbnail);
  upsert("pixel", paths.pixel);
  job.status = "SUCCEEDED";
  job.errorMessage = null;
  job.updatedAt = at;
  if (original && original.storagePath !== originalPath) {
    throw new AppError("PHOTO", "원본 경로가 변경되었습니다.");
  }
  syncVillage(state, clock);
}

export function failPixelJob(
  state: ClubState,
  actorId: string,
  jobId: string,
  message: string,
  clock: Clock,
): void {
  const job = state.imageJobs.find((item) => item.id === jobId);
  const prize = job ? state.prizes.find((item) => item.id === job.prizeId) : undefined;
  if (!job || !prize || prize.ownerMemberId !== actorId) {
    throw new AppError("FORBIDDEN", "이미지 작업 상태를 바꿀 수 없습니다.", 403);
  }
  job.status = "FAILED";
  job.errorMessage = message;
  job.updatedAt = stamp(clock);
}

export function updateCharacterPositions(
  state: ClubState,
  actorId: string,
  positions: Array<{ prizeId: string; col: number; row: number }>,
): void {
  const member = requireActiveMember(state, actorId);
  const blocked = blockedTilesForLevel(state.villageState?.unlockedLevel ?? 1);
  for (const position of positions) {
    const character = state.villageCharacters.find(
      (item) => item.prizeId === position.prizeId && item.groupId === member.groupId,
    );
    if (!character || !isWalkable(position.col, position.row, blocked)) {
      continue;
    }
    character.col = position.col;
    character.row = position.row;
  }
}

export function nickname(state: ClubState, userId: string): string {
  return state.profiles.find((profile) => profile.id === userId)?.nickname ?? "멤버";
}

export function recordStoreId(state: ClubState, record: PlayRecord): string | null {
  return state.visits.find((visit) => visit.id === record.visitId)?.storeId ?? null;
}
