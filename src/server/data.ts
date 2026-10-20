import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { assessBudget } from "@/domain/budget";
import { AppError, isAppError } from "@/domain/errors";
import type { SavePlayValues, StoreInputValues } from "@/domain/forms";
import { computeRankings, type RankingPeriod } from "@/domain/rankings";
import { REVENGE_LABELS } from "@/domain/revenge";
import { detectImageKind } from "@/domain/image-bytes";
import { villageLevelForCount, blockedTilesForLevel } from "@/domain/village";
import { parseIso, seoulLocalInputToUtc } from "@/domain/time";
import { publicMapConfig, isProductionConfigured, type PublicMapConfig } from "@/server/config";
import { withDemoState } from "@/server/demo-store";
import {
  abandonRevenge,
  acceptInvitation,
  attachOriginalAsset,
  completePixelJob,
  completeRevenge,
  createInvitation,
  createPrize,
  createRevenge,
  createStore,
  deletePrize,
  failPixelJob,
  nickname,
  registerProfile,
  requireActiveMember,
  retryPixelJob,
  revokeInvitation,
  revokeMember,
  savePlayRecord,
  setPlayRecordDeleted,
  updatePlayRecord,
  updatePrize,
  updatePrivacy,
  updateProfile,
  updateWeeklyBudget,
  updateCharacterPositions,
  type PrizeDraft,
  type SavePlayInput,
} from "@/server/engine/club-engine";
import {
  disclosedWeekly,
  listPrizeViews,
  listRecordViews,
  ownPrivacy,
  personalBudget,
  rankingBoard,
  storeSpending,
  villageView,
  type BudgetDashboard,
  type PrizeView,
  type RecordView,
  type VillageView,
} from "@/server/engine/queries";
import { assertRateLimit } from "@/server/rate-limit";
import { requireActor } from "@/server/session";
import { pixelateImage } from "@/server/images/pixelate";
import { createSupabaseServer, safeDatabaseMessage } from "@/server/supabase/server";

export interface ShellInfo {
  mode: "demo" | "production";
  nickname: string;
  isOwner: boolean;
  map: PublicMapConfig;
}

export interface HomeData {
  shell: ShellInfo;
  stores: Array<{
    id: string;
    name: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
    revenge: boolean;
  }>;
  budget: BudgetDashboard["week"];
  disclosedLabel: string;
  rankings: ReturnType<typeof rankingBoard>;
  revenge: Array<{ id: string; title: string; status: string; assignee: string }>;
  prizes: Array<{ id: string; name: string; owner: string }>;
  activity: Array<{ id: string; text: string }>;
  village: VillageView;
}

export interface MutationResult {
  ok: boolean;
  message: string;
  id?: string;
  token?: string;
  confirmation?: {
    fingerprint: string;
    spentBefore: number;
    projected: number;
    budget: number;
    excess: number;
  };
}

function confirmationFrom(projection: {
  fingerprint: string;
  spentBefore: number;
  spent: number;
  budget: number;
  excess: number;
}): MutationResult["confirmation"] {
  return {
    fingerprint: projection.fingerprint,
    spentBefore: projection.spentBefore,
    projected: projection.spent,
    budget: projection.budget,
    excess: projection.excess,
  };
}

async function demoActor() {
  const actor = await requireActor();
  if (actor.mode !== "demo") {
    throw new AppError("CONFIG", "이 작업은 데모 모드 경로가 아닙니다.");
  }
  return actor;
}

export async function loadShell(): Promise<ShellInfo | null> {
  const actor = await requireActor().catch((error: unknown) => {
    if (isAppError(error)) {
      return null;
    }
    throw error;
  });
  if (!actor) {
    return null;
  }
  if (actor.mode === "demo") {
    return withDemoState((state) => {
      const member = requireActiveMember(state, actor.id);
      return {
        mode: "demo" as const,
        nickname: nickname(state, actor.id),
        isOwner: member.role === "OWNER",
        map: publicMapConfig(),
      };
    });
  }
  const supabase = await createSupabaseServer();
  const { data: profile } = await supabase.from("profiles").select("nickname").eq("id", actor.id).maybeSingle();
  const { data: membership } = await supabase
    .from("group_members")
    .select("role,status")
    .eq("user_id", actor.id)
    .eq("status", "ACTIVE")
    .maybeSingle();
  const nicknameValue =
    profile && typeof profile.nickname === "string" ? profile.nickname : "멤버";
  const isOwner = Boolean(
    membership && typeof membership.role === "string" && membership.role === "OWNER",
  );
  return { mode: "production", nickname: nicknameValue, isOwner, map: publicMapConfig() };
}

export async function loadHome(): Promise<HomeData> {
  const actor = await requireActor();
  if (actor.mode === "production") {
    return productionHome();
  }
  return withDemoState((state) => {
    const member = requireActiveMember(state, actor.id);
    const now = new Date();
    const budget = personalBudget(state, actor.id, now);
    const disclosed = disclosedWeekly(state, actor.id, now);
    const revenge = state.revengeTargets
      .filter((target) => target.groupId === member.groupId && !target.deletedAt)
      .slice(0, 4)
      .map((target) => ({
        id: target.id,
        title: state.stores.find((store) => store.id === target.storeId)?.name ?? "매장",
        status: REVENGE_LABELS[target.status],
        assignee: nickname(state, target.assignedMemberId),
      }));
    return {
      shell: {
        mode: "demo",
        nickname: nickname(state, actor.id),
        isOwner: member.role === "OWNER",
        map: publicMapConfig(),
      },
      stores: state.stores
        .filter((store) => store.groupId === member.groupId && !store.deletedAt)
        .map((store) => ({
          id: store.id,
          name: store.name,
          address: store.address,
          latitude: store.latitude,
          longitude: store.longitude,
          revenge: state.revengeTargets.some(
            (target) => target.storeId === store.id && target.status === "ACTIVE" && !target.deletedAt,
          ),
        })),
      budget: budget.week,
      disclosedLabel:
        disclosed.coverage === "complete"
          ? "세 멤버 모두 이번 주 지출을 공개했습니다."
          : "금액 비공개로 그룹 합계는 표시하지 않습니다.",
      rankings: rankingBoard(state, actor.id, "week", now),
      revenge,
      prizes: listPrizeViews(state, actor.id)
        .slice(0, 4)
        .map((prize) => ({ id: prize.id, name: prize.name, owner: prize.ownerNickname })),
      activity: state.audit
        .filter((event) => event.groupId === member.groupId)
        .slice(-6)
        .reverse()
        .map((event) => ({ id: event.id, text: activityText(event.action) })),
      village: villageView(state, actor.id, () => now),
    };
  });
}

function activityText(action: string): string {
  if (action === "play_record_saved") return "플레이 기록이 저장되었습니다.";
  if (action === "invitation_accepted") return "새 멤버가 합류했습니다.";
  if (action === "invitation_created") return "초대가 만들어졌습니다.";
  if (action === "member_revoked") return "멤버 상태가 변경되었습니다.";
  return "그룹 활동이 기록되었습니다.";
}

export async function loadRecords(): Promise<RecordView[]> {
  const actor = await requireActor();
  if (actor.mode === "demo") {
    return withDemoState((state) => listRecordViews(state, actor.id));
  }
  return productionRecords();
}

export async function loadBudget(): Promise<BudgetDashboard> {
  const actor = await requireActor();
  if (actor.mode === "demo") {
    return withDemoState((state) => personalBudget(state, actor.id, new Date()));
  }
  const dashboard = z
    .object({
      budget: z.coerce.number(),
      week_spent: z.coerce.number(),
      month_spent: z.coerce.number(),
      lifetime_spent: z.coerce.number(),
      wins: z.coerce.number(),
      week_start: z.string(),
      week_end: z.string(),
    })
    .parse(await callRpc("my_budget_dashboard", {}));
  const records = (await productionRecords()).filter(
    (record) => record.playerId === actor.id && record.amount.amount !== null,
  );
  const byStore = new Map<string, { storeId: string; storeName: string; amount: number }>();
  for (const record of records) {
    const key = record.storeId ?? record.storeName;
    const current = byStore.get(key) ?? { storeId: key, storeName: record.storeName, amount: 0 };
    current.amount += record.amount.amount ?? 0;
    byStore.set(key, current);
  }
  return {
    week: assessBudget(dashboard.week_spent, dashboard.budget),
    monthSpent: dashboard.month_spent,
    lifetimeSpent: dashboard.lifetime_spent,
    averageCostPerWin: dashboard.wins > 0 ? dashboard.lifetime_spent / dashboard.wins : null,
    wins: dashboard.wins,
    history: records.map((record) => ({
      id: record.id,
      playedAt: record.playedAt,
      storeName: record.storeName,
      amount: record.amount.amount ?? 0,
    })),
    storeBreakdown: [...byStore.values()],
    weekStart: dashboard.week_start,
    weekEnd: dashboard.week_end,
  };
}

export async function loadRankings(period: RankingPeriod) {
  const actor = await requireActor();
  if (actor.mode === "demo") {
    return withDemoState((state) => rankingBoard(state, actor.id, period, new Date()));
  }
  const rows = z
    .array(
      z.object({
        member_id: z.string(),
        nickname: z.string(),
        attempt_count: z.coerce.number(),
        win_count: z.coerce.number(),
        prize_count: z.coerce.number(),
        distinct_store_count: z.coerce.number(),
        completed_revenge_count: z.coerce.number(),
        distinct_design_count: z.coerce.number(),
        spending: z.coerce.number().nullable(),
      }),
    )
    .parse(await callRpc("ranking_inputs", { p_period: period }));
  return computeRankings(
    rows.map((row) => ({
      memberId: row.member_id,
      nickname: row.nickname,
      attemptCount: row.attempt_count,
      winCount: row.win_count,
      prizeCount: row.prize_count,
      distinctStoreCount: row.distinct_store_count,
      completedRevengeCount: row.completed_revenge_count,
      distinctDesignCount: row.distinct_design_count,
      spending: row.spending,
    })),
    period,
  );
}

export async function loadVillage(): Promise<VillageView> {
  const actor = await requireActor();
  if (actor.mode === "demo") {
    return withDemoState((state) => villageView(state, actor.id, () => new Date()));
  }
  await callRpc("sync_village", {});
  const supabase = await createSupabaseServer();
  const { data: village, error } = await supabase.from("village_states").select("current_level,unlocked_level").maybeSingle();
  if (error) {
    throw new AppError("DATABASE", safeDatabaseMessage(error.message));
  }
  const { data: characters, error: characterError } = await supabase
    .from("village_characters")
    .select("id,prize_id,owner_member_id,display_name,sprite_path,col,row,introduced_at");
  if (characterError) {
    throw new AppError("DATABASE", safeDatabaseMessage(characterError.message));
  }
  const current = typeof village?.current_level === "number" ? village.current_level : 1;
  const unlocked = typeof village?.unlocked_level === "number" ? village.unlocked_level : 1;
  const list = Array.isArray(characters) ? characters : [];
  const level = villageLevelForCount(list.length);
  return {
    currentLevel: current,
    unlockedLevel: unlocked,
    levelName: level.name,
    eligibleCount: list.length,
    blocked: [...blockedTilesForLevel(unlocked)],
    characters: list.map((character) => {
      const row = z
        .object({
          id: z.string(),
          prize_id: z.string(),
          owner_member_id: z.string(),
          display_name: z.string(),
          sprite_path: z.string().nullable(),
          col: z.number(),
          row: z.number(),
          introduced_at: z.string(),
        })
        .parse(character);
      return {
        id: row.id,
        prizeId: row.prize_id,
        ownerMemberId: row.owner_member_id,
        ownerNickname: "",
        name: row.display_name,
        col: row.col,
        row: row.row,
        spriteKind: row.sprite_path ? ("pixel" as const) : ("placeholder" as const),
        spritePath: row.sprite_path,
        introducedAt: row.introduced_at,
      };
    }),
  };
}

export async function loadPrizes(): Promise<PrizeView[]> {
  const actor = await requireActor();
  if (actor.mode === "demo") {
    return withDemoState((state) => listPrizeViews(state, actor.id));
  }
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("prizes")
    .select("id,name,description,visibility,owner_member_id,acquired_at,prize_design_id,unlink_note");
  if (error) {
    throw new AppError("DATABASE", safeDatabaseMessage(error.message));
  }
  const rows = z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        visibility: z.enum(["PRIVATE", "GROUP"]),
        owner_member_id: z.string(),
        acquired_at: z.string(),
        prize_design_id: z.string(),
        unlink_note: z.string().nullable(),
      }),
    )
    .parse(data ?? []);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: "기타",
    description: row.description,
    ownerMemberId: row.owner_member_id,
    ownerNickname: row.owner_member_id === actor.id ? "나" : "멤버",
    visibility: row.visibility,
    acquiredAt: row.acquired_at,
    storeName: null,
    designId: row.prize_design_id,
    unlinkNote: row.unlink_note,
    originalPath: null,
    pixelPath: null,
    processingStatus: null,
    processingError: null,
  }));
}

export async function loadPrize(id: string): Promise<PrizeView | null> {
  const prizes = await loadPrizes();
  const prize = prizes.find((item) => item.id === id) ?? null;
  if (!prize || !isProductionConfigured()) {
    return prize;
  }
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("prize_assets").select("asset_type").eq("prize_id", id);
  if (error || !data) {
    return prize;
  }
  const assets = z.array(z.object({ asset_type: z.string() })).parse(data);
  return {
    ...prize,
    originalPath: assets.some((asset) => asset.asset_type === "original") ? "available" : null,
    pixelPath: assets.some((asset) => asset.asset_type === "pixel") ? "available" : null,
  };
}

export async function submitStore(input: StoreInputValues): Promise<MutationResult> {
  const actor = await requireActor();
  try {
    if (actor.mode === "demo") {
      const store = await withDemoState((state) => createStore(state, actor.id, input, () => new Date()));
      return { ok: true, message: "매장을 등록했습니다.", id: store.id };
    }
    const supabase = await createSupabaseServer();
    const { data: membership, error: memberError } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", actor.id)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (memberError || !membership || typeof membership.group_id !== "string") {
      throw new AppError("FORBIDDEN", "그룹에 참여한 뒤 매장을 등록할 수 있습니다.", 403);
    }
    const { data, error } = await supabase
      .from("stores")
      .insert({
        group_id: membership.group_id,
        name: input.name,
        address: input.address,
        latitude: input.latitude,
        longitude: input.longitude,
        notes: input.notes,
        created_by: actor.id,
      })
      .select("id")
      .single();
    if (error) {
      throw new AppError("DATABASE", safeDatabaseMessage(error.message));
    }
    const id = z.object({ id: z.string() }).parse(data).id;
    return { ok: true, message: "매장을 등록했습니다.", id };
  } catch (error) {
    return failure(error);
  }
}

export async function submitPlay(input: SavePlayValues): Promise<MutationResult> {
  const actor = await requireActor();
  const playedAt = parsePlayedAt(input.playedAt);
  try {
    if (actor.mode === "demo") {
      const result = await withDemoState((state) =>
        savePlayRecord(state, actor.id, toEnginePlay(input, playedAt), () => new Date()),
      );
      if (result.status === "confirmation_required") {
        return {
          ok: false,
          message: "이번 주 예산을 넘깁니다. 금액을 확인하고 다시 저장해 주세요.",
          confirmation: confirmationFrom(result.projection),
        };
      }
      return { ok: true, message: "플레이 기록을 저장했습니다.", id: result.recordId };
    }
    const payload = await callRpc("save_play_record", {
      p_payload: {
        store_id: input.storeId,
        visit_id: input.visitId,
        played_at: playedAt,
        attempt_count: input.attemptCount,
        win_count: input.winCount,
        amount_spent: input.amountSpent,
        machine_label: input.machineLabel,
        notes: input.notes,
        prizes: input.prizes,
        idempotency_key: input.idempotencyKey,
        confirm_fingerprint: input.confirmFingerprint,
      },
    });
    return parseSavePayload(payload);
  } catch (error) {
    return failure(error);
  }
}

export async function submitRecordEdit(
  recordId: string,
  input: Omit<SavePlayValues, "storeId" | "visitId" | "newVisit" | "prizes" | "idempotencyKey">,
): Promise<MutationResult> {
  const actor = await demoActor();
  try {
    const result = await withDemoState((state) =>
      updatePlayRecord(
        state,
        actor.id,
        {
          recordId,
          playedAt: parsePlayedAt(input.playedAt),
          attemptCount: input.attemptCount,
          winCount: input.winCount,
          amountSpent: input.amountSpent,
          machineLabel: input.machineLabel,
          notes: input.notes,
          confirmFingerprint: input.confirmFingerprint,
        },
        () => new Date(),
      ),
    );
    if (result.status === "confirmation_required") {
      return {
        ok: false,
        message: "수정한 금액이 이번 주 예산을 넘깁니다. 확인 후 다시 저장해 주세요.",
        confirmation: confirmationFrom(result.projection),
      };
    }
    return { ok: true, message: "기록을 수정했습니다.", id: result.recordId };
  } catch (error) {
    return failure(error);
  }
}

export async function submitDeleteRecord(recordId: string, restore: boolean, fingerprint: string | null): Promise<MutationResult> {
  const actor = await requireActor();
  try {
    if (actor.mode === "demo") {
      const result = await withDemoState((state) =>
        setPlayRecordDeleted(state, actor.id, recordId, !restore, fingerprint, () => new Date()),
      );
      if (result.status === "confirmation_required") {
        return {
          ok: false,
          message: "복구하면 이번 주 예산을 넘깁니다. 확인 후 다시 시도해 주세요.",
          confirmation: confirmationFrom(result.projection),
        };
      }
      return { ok: true, message: restore ? "기록을 복구했습니다." : "기록을 삭제했습니다. 연결된 인형은 남아 있습니다." };
    }
    const payload = await callRpc("set_play_record_deleted", {
      p_id: recordId,
      p_deleted: !restore,
      p_fingerprint: fingerprint,
    });
    return parseSavePayload(payload);
  } catch (error) {
    return failure(error);
  }
}

export async function submitRevenge(input: {
  storeId: string;
  assignedMemberId: string;
  reason: string;
}): Promise<MutationResult> {
  const actor = await demoActor();
  try {
    const target = await withDemoState((state) =>
      createRevenge(
        state,
        actor.id,
        { ...input, notes: "" },
        () => new Date(),
      ),
    );
    return { ok: true, message: "복수 목표를 만들었습니다.", id: target.id };
  } catch (error) {
    return failure(error);
  }
}

export async function submitCompleteRevenge(targetId: string, recordId: string): Promise<MutationResult> {
  const actor = await requireActor();
  try {
    if (actor.mode === "demo") {
      await withDemoState((state) => completeRevenge(state, actor.id, targetId, recordId, true, () => new Date()));
      return { ok: true, message: "재도전을 완료했습니다." };
    }
    await callRpc("complete_revenge", { p_target: targetId, p_record: recordId });
    return { ok: true, message: "재도전을 완료했습니다." };
  } catch (error) {
    return failure(error);
  }
}

export async function submitAbandonRevenge(targetId: string): Promise<MutationResult> {
  const actor = await demoActor();
  try {
    await withDemoState((state) => abandonRevenge(state, actor.id, targetId, () => new Date()));
    return { ok: true, message: "오늘은 여기까지로 표시했습니다." };
  } catch (error) {
    return failure(error);
  }
}

export async function submitPrize(input: PrizeDraft & { acquisitionPlayRecordId: string | null }): Promise<MutationResult> {
  const actor = await demoActor();
  try {
    const prize = await withDemoState((state) => createPrize(state, actor.id, input, () => new Date()));
    return { ok: true, message: "인형을 등록했습니다.", id: prize.id };
  } catch (error) {
    return failure(error);
  }
}

export async function submitPrizeVisibility(prizeId: string, visibility: "PRIVATE" | "GROUP"): Promise<MutationResult> {
  const actor = await demoActor();
  try {
    await withDemoState((state) => {
      const prize = state.prizes.find((item) => item.id === prizeId && !item.deletedAt);
      if (!prize || prize.ownerMemberId !== actor.id) {
        throw new AppError("FORBIDDEN", "이 인형의 공개 범위를 바꿀 수 없습니다.", 403);
      }
      const design = state.prizeDesigns.find((item) => item.id === prize.prizeDesignId);
      updatePrize(
        state,
        actor.id,
        prizeId,
        {
          name: prize.name,
          category: design?.category ?? "기타",
          description: prize.description,
          visibility,
          acquisitionPlayRecordId: prize.acquisitionPlayRecordId,
        },
        () => new Date(),
      );
    });
    return { ok: true, message: "공개 범위를 저장했습니다." };
  } catch (error) {
    return failure(error);
  }
}

export async function removePrize(prizeId: string): Promise<MutationResult> {
  const actor = await demoActor();
  try {
    await withDemoState((state) => deletePrize(state, actor.id, prizeId, () => new Date()));
    return { ok: true, message: "인형을 목록에서 뺐습니다." };
  } catch (error) {
    return failure(error);
  }
}

export async function storePrizePhoto(prizeId: string, bytes: Buffer, retry: boolean): Promise<MutationResult> {
  const actor = await requireActor();
  assertRateLimit(`upload:${actor.id}`, 8, 60_000);
  if (!detectImageKind(bytes)) {
    return { ok: false, message: "JPEG, PNG, WebP 파일만 올릴 수 있습니다." };
  }
  try {
    if (actor.mode === "demo") {
      const root = path.join(process.cwd(), ".demo-data", "uploads", prizeId);
      mkdirSync(root, { recursive: true });
      await withDemoState((state) => {
        if (!retry) {
          const originalPath = path.join(root, "original.bin");
          writeFileSync(originalPath, bytes);
          attachOriginalAsset(state, actor.id, prizeId, originalPath, () => new Date());
        } else {
          retryPixelJob(state, actor.id, prizeId, () => new Date());
        }
      });
      try {
        const images = await pixelateImage(bytes);
        writeFileSync(path.join(root, "pixel.png"), images.png);
        writeFileSync(path.join(root, "thumb.png"), images.thumbnail);
        await withDemoState((state) => {
          const job = [...state.imageJobs].reverse().find((item) => item.prizeId === prizeId && item.status === "PROCESSING");
          if (!job) {
            throw new AppError("PHOTO", "이미지 작업을 찾을 수 없습니다.");
          }
          completePixelJob(
            state,
            actor.id,
            job.id,
            { thumbnail: path.join(root, "thumb.png"), pixel: path.join(root, "pixel.png") },
            () => new Date(),
          );
        });
      } catch (error) {
        await withDemoState((state) => {
          const job = [...state.imageJobs].reverse().find((item) => item.prizeId === prizeId && item.status === "PROCESSING");
          if (job) {
            failPixelJob(
              state,
              actor.id,
              job.id,
              isAppError(error) ? error.message : "픽셀 변환에 실패했습니다.",
              () => new Date(),
            );
          }
        });
        return { ok: false, message: isAppError(error) ? error.message : "픽셀 변환에 실패했습니다. 원본은 보관되어 있습니다." };
      }
      return { ok: true, message: "원본을 보관하고 픽셀 이미지를 만들었습니다." };
    }
    const supabase = await createSupabaseServer();
    const { data: membership, error: memberError } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", actor.id)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (memberError || !membership || typeof membership.group_id !== "string") {
      throw new AppError("FORBIDDEN", "그룹에 참여한 뒤 사진을 올릴 수 있습니다.", 403);
    }
    const groupId = membership.group_id;
    const { data: existingAssets, error: assetError } = await supabase
      .from("prize_assets")
      .select("asset_type,version")
      .eq("prize_id", prizeId);
    if (assetError) {
      throw new AppError("DATABASE", safeDatabaseMessage(assetError.message));
    }
    const assets = z.array(z.object({ asset_type: z.string(), version: z.number() })).parse(existingAssets ?? []);
    const hasOriginal = assets.some((asset) => asset.asset_type === "original");
    if (!retry && hasOriginal) {
      return { ok: false, message: "원본 사진은 이미 보관되어 있습니다. 픽셀 이미지만 다시 만들 수 있습니다." };
    }
    if (retry && !hasOriginal) {
      return { ok: false, message: "다시 만들 원본 사진이 없습니다." };
    }
    const version = Math.max(0, ...assets.map((asset) => asset.version)) + 1;
    if (!retry) {
      const originalPath = `${groupId}/${prizeId}/original.bin`;
      const uploaded = await supabase.storage.from("prize-assets").upload(originalPath, bytes, {
        upsert: false,
        contentType: "application/octet-stream",
      });
      if (uploaded.error) {
        throw new AppError("PHOTO", "원본 사진을 저장하지 못했습니다. Storage 버킷 prize-assets가 있는지 확인해 주세요.");
      }
      const inserted = await supabase.from("prize_assets").insert({
        prize_id: prizeId,
        asset_type: "original",
        storage_path: originalPath,
        processing_status: "SUCCEEDED",
        version: 1,
      });
      if (inserted.error) {
        throw new AppError("DATABASE", safeDatabaseMessage(inserted.error.message));
      }
    }
    const job = await supabase.from("image_processing_jobs").insert({
      prize_id: prizeId,
      status: "PROCESSING",
      version,
    }).select("id").single();
    if (job.error) {
      throw new AppError("DATABASE", safeDatabaseMessage(job.error.message));
    }
    try {
      const images = await pixelateImage(retry ? bytes : bytes);
      const pixelPath = `${groupId}/${prizeId}/pixel-v${version}.png`;
      const thumbPath = `${groupId}/${prizeId}/thumb-v${version}.png`;
      const pixelUpload = await supabase.storage.from("prize-assets").upload(pixelPath, images.png, {
        upsert: false,
        contentType: "image/png",
      });
      const thumbUpload = await supabase.storage.from("prize-assets").upload(thumbPath, images.thumbnail, {
        upsert: false,
        contentType: "image/png",
      });
      if (pixelUpload.error || thumbUpload.error) {
        throw new AppError("PHOTO", "변환 이미지를 저장하지 못했습니다. 원본은 남아 있습니다.");
      }
      await supabase.from("prize_assets").insert([
        { prize_id: prizeId, asset_type: "pixel", storage_path: pixelPath, processing_status: "SUCCEEDED", version },
        { prize_id: prizeId, asset_type: "thumbnail", storage_path: thumbPath, processing_status: "SUCCEEDED", version },
      ]);
      await supabase.from("image_processing_jobs").update({ status: "SUCCEEDED" }).eq("id", z.object({ id: z.string() }).parse(job.data).id);
      await callRpc("sync_village", {});
    } catch (error) {
      await supabase
        .from("image_processing_jobs")
        .update({ status: "FAILED", error_message: isAppError(error) ? error.message : "픽셀 변환에 실패했습니다." })
        .eq("id", z.object({ id: z.string() }).parse(job.data).id);
      return { ok: false, message: isAppError(error) ? error.message : "픽셀 변환에 실패했습니다. 원본은 보관되어 있습니다." };
    }
    return { ok: true, message: "원본을 보관하고 픽셀 이미지를 만들었습니다." };
  } catch (error) {
    return failure(error);
  }
}

export async function readDemoAsset(prizeId: string, kind: "pixel" | "original"): Promise<Buffer | null> {
  const actor = await requireActor();
  if (isProductionConfigured()) {
    return null;
  }
  const allowed = await withDemoState((state) => {
    const prize = state.prizes.find((item) => item.id === prizeId);
    if (!prize || prize.deletedAt) {
      return false;
    }
    if (prize.ownerMemberId === actor.id) {
      return true;
    }
    return prize.visibility === "GROUP";
  });
  if (!allowed) {
    return null;
  }
  const filename = kind === "pixel" ? "pixel.png" : "original.bin";
  const full = path.join(process.cwd(), ".demo-data", "uploads", prizeId, filename);
  try {
    return readFileSync(full);
  } catch {
    return null;
  }
}

export async function loadSettings() {
  const actor = await requireActor();
  if (actor.mode === "demo") {
    return withDemoState((state) => {
      const privacy = ownPrivacy(state, actor.id);
      const budget = state.budgetSettings.find((row) => row.memberId === actor.id);
      return {
        nickname: nickname(state, actor.id),
        privacy,
        weeklyBudget: budget?.weeklyBudgetKrw ?? 10000,
      };
    });
  }
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("privacy_settings").select("*").eq("member_id", actor.id).maybeSingle();
  if (error) {
    throw new AppError("DATABASE", safeDatabaseMessage(error.message));
  }
  const privacy = z
    .object({
      show_total_spending: z.enum(["PRIVATE", "GROUP"]),
      show_weekly_spending: z.enum(["PRIVATE", "GROUP"]),
      show_store_spending: z.enum(["PRIVATE", "GROUP"]),
      show_individual_record_amounts: z.enum(["PRIVATE", "GROUP"]),
      show_monthly_statistics: z.enum(["PRIVATE", "GROUP"]),
    })
    .parse(data);
  return {
    nickname: (await loadShell())?.nickname ?? "멤버",
    privacy: {
      memberId: actor.id,
      groupId: "",
      showTotalSpending: privacy.show_total_spending,
      showWeeklySpending: privacy.show_weekly_spending,
      showStoreSpending: privacy.show_store_spending,
      showIndividualRecordAmounts: privacy.show_individual_record_amounts,
      showMonthlyStatistics: privacy.show_monthly_statistics,
      updatedAt: "",
    },
    weeklyBudget: 10000,
  };
}

export async function saveSettings(input: {
  nickname: string;
  weeklyBudget: number;
  privacy: {
    showTotalSpending: "PRIVATE" | "GROUP";
    showWeeklySpending: "PRIVATE" | "GROUP";
    showStoreSpending: "PRIVATE" | "GROUP";
    showIndividualRecordAmounts: "PRIVATE" | "GROUP";
    showMonthlyStatistics: "PRIVATE" | "GROUP";
  };
}): Promise<MutationResult> {
  const actor = await requireActor();
  try {
    if (actor.mode === "demo") {
      await withDemoState((state) => {
        updateProfile(state, actor.id, input.nickname, () => new Date());
        updateWeeklyBudget(state, actor.id, input.weeklyBudget, () => new Date());
        updatePrivacy(state, actor.id, input.privacy, () => new Date());
      });
      return { ok: true, message: "설정을 저장했습니다." };
    }
    const supabase = await createSupabaseServer();
    const { error: profileError } = await supabase.from("profiles").update({ nickname: input.nickname }).eq("id", actor.id);
    if (profileError) {
      throw new AppError("DATABASE", safeDatabaseMessage(profileError.message));
    }
    const { error } = await supabase
      .from("privacy_settings")
      .update({
        show_total_spending: input.privacy.showTotalSpending,
        show_weekly_spending: input.privacy.showWeeklySpending,
        show_store_spending: input.privacy.showStoreSpending,
        show_individual_record_amounts: input.privacy.showIndividualRecordAmounts,
        show_monthly_statistics: input.privacy.showMonthlyStatistics,
      })
      .eq("member_id", actor.id);
    if (error) {
      throw new AppError("DATABASE", safeDatabaseMessage(error.message));
    }
    const { error: budgetError } = await supabase
      .from("budget_settings")
      .update({ weekly_budget_krw: input.weeklyBudget })
      .eq("member_id", actor.id);
    if (budgetError) {
      throw new AppError("DATABASE", safeDatabaseMessage(budgetError.message));
    }
    return { ok: true, message: "설정을 저장했습니다." };
  } catch (error) {
    return failure(error);
  }
}

export async function loadMemberAdmin() {
  const actor = await requireActor();
  if (actor.mode === "demo") {
    return withDemoState((state) => {
      const member = requireActiveMember(state, actor.id);
      return {
        isOwner: member.role === "OWNER",
        members: state.members
          .filter((item) => item.groupId === member.groupId)
          .map((item) => ({
            userId: item.userId,
            nickname: nickname(state, item.userId),
            role: item.role,
            status: item.status,
          })),
        invitations: state.invitations
          .filter((item) => item.groupId === member.groupId)
          .map((item) => ({
            id: item.id,
            expiresAt: item.expiresAt,
            usedAt: item.usedAt,
            revokedAt: item.revokedAt,
          })),
      };
    });
  }
  const supabase = await createSupabaseServer();
  const { data: members, error } = await supabase.from("group_members").select("user_id,role,status");
  if (error) {
    throw new AppError("DATABASE", safeDatabaseMessage(error.message));
  }
  const { data: invitations, error: inviteError } = await supabase
    .from("invitation_summaries")
    .select("id,expires_at,used_at,revoked_at");
  if (inviteError) {
    throw new AppError("DATABASE", safeDatabaseMessage(inviteError.message));
  }
  return {
    isOwner: (await loadShell())?.isOwner ?? false,
    members: z
      .array(z.object({ user_id: z.string(), role: z.enum(["OWNER", "MEMBER"]), status: z.enum(["INVITED", "ACTIVE", "REVOKED"]) }))
      .parse(members ?? [])
      .map((item) => ({ userId: item.user_id, nickname: "멤버", role: item.role, status: item.status })),
    invitations: z
      .array(z.object({ id: z.string(), expires_at: z.string(), used_at: z.string().nullable(), revoked_at: z.string().nullable() }))
      .parse(invitations ?? [])
      .map((item) => ({ id: item.id, expiresAt: item.expires_at, usedAt: item.used_at, revokedAt: item.revoked_at })),
  };
}

export async function issueInvitation(): Promise<MutationResult> {
  const actor = await requireActor();
  assertRateLimit(`invite:${actor.id}`, 5, 60_000);
  try {
    if (actor.mode === "demo") {
      const created = await withDemoState((state) => createInvitation(state, actor.id, () => new Date()));
      return { ok: true, message: "초대 링크는 이 화면에만 한 번 표시됩니다.", token: created.token, id: created.invitationId };
    }
    const { generateInvitationToken, hashInvitationToken } = await import("@/server/engine/club-engine");
    const token = generateInvitationToken();
    await callRpc("create_invitation", { p_token_hash: hashInvitationToken(token) });
    return { ok: true, message: "초대 링크는 이 화면에만 한 번 표시됩니다.", token };
  } catch (error) {
    return failure(error);
  }
}

export async function acceptInviteToken(token: string): Promise<MutationResult> {
  const actor = await requireActor();
  assertRateLimit(`accept:${actor.id}`, 8, 60_000);
  try {
    if (actor.mode === "demo") {
      await withDemoState((state) => acceptInvitation(state, actor.id, token, () => new Date()));
      return { ok: true, message: "그룹에 참여했습니다." };
    }
    const { hashInvitationToken } = await import("@/server/engine/club-engine");
    await callRpc("accept_invitation", { p_token_hash: hashInvitationToken(token) });
    return { ok: true, message: "그룹에 참여했습니다." };
  } catch (error) {
    return failure(error);
  }
}

export async function bootstrapProductionGroup(name: string): Promise<MutationResult> {
  const actor = await requireActor();
  try {
    if (actor.mode === "demo") {
      return { ok: false, message: "데모 그룹은 이미 만들어져 있습니다." };
    }
    await callRpc("bootstrap_group", { p_name: name });
    return { ok: true, message: "비공개 그룹을 만들었습니다. 방장으로 참여합니다." };
  } catch (error) {
    return failure(error);
  }
}

export async function revokeInvite(id: string): Promise<MutationResult> {
  const actor = await requireActor();
  try {
    if (actor.mode === "demo") {
      await withDemoState((state) => revokeInvitation(state, actor.id, id, () => new Date()));
      return { ok: true, message: "초대를 취소했습니다." };
    }
    await callRpc("revoke_invitation", { p_id: id });
    return { ok: true, message: "초대를 취소했습니다." };
  } catch (error) {
    return failure(error);
  }
}

export async function revokeGroupMember(userId: string): Promise<MutationResult> {
  const actor = await requireActor();
  try {
    if (actor.mode === "demo") {
      await withDemoState((state) => revokeMember(state, actor.id, userId, () => new Date()));
      return { ok: true, message: "멤버를 비활성화했습니다." };
    }
    await callRpc("revoke_member", { p_user_id: userId });
    return { ok: true, message: "멤버를 비활성화했습니다." };
  } catch (error) {
    return failure(error);
  }
}

export async function loadStoreDetail(storeId: string) {
  const actor = await requireActor();
  if (actor.mode !== "demo") {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.from("stores").select("id,name,address,latitude,longitude,notes").eq("id", storeId).maybeSingle();
    if (error) {
      throw new AppError("DATABASE", safeDatabaseMessage(error.message));
    }
    if (!data) {
      return null;
    }
    const store = z
      .object({
        id: z.string(),
        name: z.string(),
        address: z.string(),
        latitude: z.number().nullable(),
        longitude: z.number().nullable(),
        notes: z.string(),
      })
      .parse(data);
    return { store, records: [] as RecordView[], spendingLabel: "운영 모드에서는 공개된 금액만 별도 API로 계산합니다." };
  }
  return withDemoState((state) => {
    const store = state.stores.find((item) => item.id === storeId && !item.deletedAt);
    if (!store) {
      return null;
    }
    const spending = storeSpending(state, actor.id, storeId);
    return {
      store,
      records: listRecordViews(state, actor.id).filter((record) => record.storeId === storeId),
      spendingLabel:
        spending.coverage === "complete"
          ? "이 매장의 공개된 합계를 표시할 수 있습니다."
          : "금액 비공개 멤버가 있어 매장 합계는 표시하지 않습니다.",
      permittedSpent: spending.permittedSpent,
      groupTotal: spending.groupTotal,
    };
  });
}

export async function loadRecord(recordId: string): Promise<RecordView | null> {
  const records = await loadRecords();
  return records.find((record) => record.id === recordId) ?? null;
}

export async function loadRevengeBoard() {
  const actor = await requireActor();
  if (actor.mode !== "demo") {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase
      .from("revenge_targets")
      .select("id,store_id,assigned_member_id,status,reason,needs_review,completion_play_record_id");
    if (error) {
      throw new AppError("DATABASE", safeDatabaseMessage(error.message));
    }
    const rows = z
      .array(
        z.object({
          id: z.string(),
          store_id: z.string(),
          assigned_member_id: z.string(),
          status: z.enum(["ACTIVE", "COMPLETED", "ABANDONED"]),
          reason: z.string(),
          needs_review: z.boolean(),
          completion_play_record_id: z.string().nullable(),
        }),
      )
      .parse(data ?? []);
    return rows.map((row) => ({
      id: row.id,
      storeId: row.store_id,
      storeName: "매장",
      assignee: row.assigned_member_id,
      status: row.status,
      label: REVENGE_LABELS[row.status],
      reason: row.reason,
      needsReview: row.needs_review,
      completionPlayRecordId: row.completion_play_record_id,
    }));
  }
  return withDemoState((state) => {
    const member = requireActiveMember(state, actor.id);
    return state.revengeTargets
      .filter((target) => target.groupId === member.groupId && !target.deletedAt)
      .map((target) => ({
        id: target.id,
        storeId: target.storeId,
        storeName: state.stores.find((store) => store.id === target.storeId)?.name ?? "매장",
        assignee: nickname(state, target.assignedMemberId),
        assignedMemberId: target.assignedMemberId,
        status: target.status,
        label: REVENGE_LABELS[target.status],
        reason: target.reason,
        needsReview: target.needsReview,
        completionPlayRecordId: target.completionPlayRecordId,
      }));
  });
}

export async function rememberPositions(positions: Array<{ prizeId: string; col: number; row: number }>): Promise<void> {
  const actor = await requireActor();
  if (actor.mode !== "demo") {
    return;
  }
  await withDemoState((state) => updateCharacterPositions(state, actor.id, positions));
}

export async function searchPlaces(query: string): Promise<{ available: boolean; message: string; results: Array<{ name: string; address: string; latitude: number; longitude: number }> }> {
  const actor = await requireActor();
  assertRateLimit(`search:${actor.id}`, 20, 60_000);
  const map = publicMapConfig();
  if (!map.searchReady || query.trim().length < 2) {
    return {
      available: false,
      message: map.message ?? "장소 검색 API가 설정되지 않았습니다. 매장을 직접 등록해 주세요.",
      results: [],
    };
  }
  if (map.provider === "naver") {
    const response = await fetch(`https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=5`, {
      headers: {
        "X-Naver-Client-Id": process.env.NAVER_SEARCH_CLIENT_ID ?? "",
        "X-Naver-Client-Secret": process.env.NAVER_SEARCH_CLIENT_SECRET ?? "",
      },
    });
    if (!response.ok) {
      return { available: false, message: "네이버 장소 검색에 실패했습니다.", results: [] };
    }
    const body: unknown = await response.json();
    const items = z.object({ items: z.array(z.object({ title: z.string(), address: z.string(), mapx: z.string(), mapy: z.string() })) }).parse(body);
    return {
      available: true,
      message: "",
      results: items.items.map((item) => ({
        name: item.title.replace(/<[^>]+>/g, ""),
        address: item.address,
        longitude: Number(item.mapx) / 10_000_000,
        latitude: Number(item.mapy) / 10_000_000,
      })),
    };
  }
  const response = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}`, {
    headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY ?? ""}` },
  });
  if (!response.ok) {
    return { available: false, message: "카카오 장소 검색에 실패했습니다.", results: [] };
  }
  const body: unknown = await response.json();
  const items = z
    .object({
      documents: z.array(z.object({ place_name: z.string(), address_name: z.string(), x: z.string(), y: z.string() })),
    })
    .parse(body);
  return {
    available: true,
    message: "",
    results: items.documents.map((item) => ({
      name: item.place_name,
      address: item.address_name,
      longitude: Number(item.x),
      latitude: Number(item.y),
    })),
  };
}

export async function ensureDemoProfile(userId: string, nicknameValue: string): Promise<void> {
  if (isProductionConfigured()) {
    throw new AppError("FORBIDDEN", "데모 계정은 운영 모드에서 사용할 수 없습니다.", 403);
  }
  await withDemoState((state) => {
    registerProfile(state, userId, nicknameValue, () => new Date());
  });
}

function parsePlayedAt(value: string): string {
  if (value.endsWith("Z") || value.includes("+")) {
    return parseIso(value).toISOString();
  }
  return seoulLocalInputToUtc(value).toISOString();
}

function toEnginePlay(input: SavePlayValues, playedAt: string): SavePlayInput {
  return { ...input, playedAt };
}

function failure(error: unknown): MutationResult {
  if (isAppError(error)) {
    return { ok: false, message: error.message };
  }
  console.error(error);
  return { ok: false, message: "요청을 처리하지 못했습니다. 다시 시도해 주세요." };
}

async function callRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    throw new AppError("DATABASE", safeDatabaseMessage(error.message));
  }
  return data;
}

function parseSavePayload(payload: unknown): MutationResult {
  const parsed = z
    .object({
      status: z.enum(["saved", "confirmation_required"]),
      record_id: z.string().optional(),
      fingerprint: z.string().optional(),
      spent_before: z.coerce.number().optional(),
      projected: z.coerce.number().optional(),
      budget: z.coerce.number().optional(),
      excess: z.coerce.number().optional(),
    })
    .parse(payload);
  if (parsed.status === "confirmation_required" && parsed.fingerprint && parsed.spent_before !== undefined && parsed.projected !== undefined && parsed.budget !== undefined && parsed.excess !== undefined) {
    return {
      ok: false,
      message: "이번 주 예산을 넘깁니다. 금액을 확인하고 다시 저장해 주세요.",
      confirmation: {
        fingerprint: parsed.fingerprint,
        spentBefore: parsed.spent_before,
        projected: parsed.projected,
        budget: parsed.budget,
        excess: parsed.excess,
      },
    };
  }
  return { ok: true, message: "저장했습니다.", id: parsed.record_id };
}

async function productionHome(): Promise<HomeData> {
  const shell = await loadShell();
  if (!shell) {
    throw new AppError("AUTH", "로그인이 필요합니다.", 401);
  }
  const [budget, rankings, village, prizes] = await Promise.all([
    loadBudget(),
    loadRankings("week"),
    loadVillage(),
    loadPrizes(),
  ]);
  const supabase = await createSupabaseServer();
  const { data: stores, error } = await supabase.from("stores").select("id,name,address,latitude,longitude");
  if (error) {
    throw new AppError("DATABASE", safeDatabaseMessage(error.message));
  }
  const storeRows = z
    .array(z.object({ id: z.string(), name: z.string(), address: z.string(), latitude: z.number().nullable(), longitude: z.number().nullable() }))
    .parse(stores ?? []);
  return {
    shell,
    stores: storeRows.map((store) => ({ ...store, revenge: false })),
    budget: budget.week,
    disclosedLabel: "다른 멤버의 금액은 각 공개 설정이 허용할 때만 합산됩니다.",
    rankings,
    revenge: [],
    prizes: prizes.slice(0, 4).map((prize) => ({ id: prize.id, name: prize.name, owner: prize.ownerNickname })),
    activity: [],
    village,
  };
}

async function productionRecords(): Promise<RecordView[]> {
  const actor = await requireActor();
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("play_records")
    .select("id,player_id,played_at,attempt_count,win_count,machine_label,notes,deleted_at,visit_id");
  if (error) {
    throw new AppError("DATABASE", safeDatabaseMessage(error.message));
  }
  const records = z
    .array(
      z.object({
        id: z.string(),
        player_id: z.string(),
        played_at: z.string(),
        attempt_count: z.number(),
        win_count: z.number(),
        machine_label: z.string(),
        notes: z.string(),
        deleted_at: z.string().nullable(),
        visit_id: z.string(),
      }),
    )
    .parse(data ?? []);
  const { data: visits, error: visitError } = await supabase.from("visits").select("id,store_id");
  if (visitError) {
    throw new AppError("DATABASE", safeDatabaseMessage(visitError.message));
  }
  const { data: stores, error: storeError } = await supabase.from("stores").select("id,name");
  if (storeError) {
    throw new AppError("DATABASE", safeDatabaseMessage(storeError.message));
  }
  const { data: profiles, error: profileError } = await supabase.from("profiles").select("id,nickname");
  if (profileError) {
    throw new AppError("DATABASE", safeDatabaseMessage(profileError.message));
  }
  const visitRows = z.array(z.object({ id: z.string(), store_id: z.string() })).parse(visits ?? []);
  const storeRows = z.array(z.object({ id: z.string(), name: z.string() })).parse(stores ?? []);
  const profileRows = z.array(z.object({ id: z.string(), nickname: z.string() })).parse(profiles ?? []);
  const storeByVisit = new Map(visitRows.map((visit) => [visit.id, visit.store_id]));
  const storeNameById = new Map(storeRows.map((store) => [store.id, store.name]));
  const nameById = new Map(profileRows.map((profile) => [profile.id, profile.nickname]));
  const amounts = z
    .array(z.object({ play_record_id: z.string(), amount_spent: z.number() }))
    .parse(await callRpc("visible_record_amounts", { p_ids: records.map((record) => record.id) }));
  const amountMap = new Map(amounts.map((row) => [row.play_record_id, row.amount_spent]));
  return records
    .filter((record) => !record.deleted_at)
    .map((record) => {
      const amount = amountMap.get(record.id);
      const storeId = storeByVisit.get(record.visit_id) ?? null;
      return {
        id: record.id,
        playerId: record.player_id,
        playerNickname: nameById.get(record.player_id) ?? "멤버",
        storeId,
        storeName: storeId ? storeNameById.get(storeId) ?? "매장" : "매장",
        playedAt: record.played_at,
        attemptCount: record.attempt_count,
        winCount: record.win_count,
        machineLabel: record.machine_label,
        notes: record.notes,
        deleted: false,
        amount:
          amount === undefined
            ? { visible: false, amount: null }
            : { visible: true, amount },
        canEdit: record.player_id === actor.id,
      };
    });
}
