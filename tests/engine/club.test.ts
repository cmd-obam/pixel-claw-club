import { describe, expect, it } from "vitest";
import { seoulWallToUtc } from "@/domain/time";
import {
  acceptInvitation,
  attachOriginalAsset,
  bootstrapGroup,
  completePixelJob,
  completeRevenge,
  createInvitation,
  createPrize,
  createRevenge,
  createStore,
  emptyState,
  failPixelJob,
  registerProfile,
  retryPixelJob,
  savePlayRecord,
  setPlayRecordDeleted,
  updatePlayRecord,
  updatePrivacy,
  type Clock,
  type SavePlayInput,
} from "@/server/engine/club-engine";
import {
  disclosedWeekly,
  listPrizeViews,
  listRecordViews,
  personalBudget,
  rankingBoard,
  storeSpending,
  villageView,
} from "@/server/engine/queries";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";

function at(iso: string): Clock {
  return () => new Date(iso);
}

function setup(clock: Clock = at("2026-10-20T03:00:00.000Z")) {
  const state = emptyState();
  registerProfile(state, A, "멤버 A", clock);
  registerProfile(state, B, "멤버 B", clock);
  registerProfile(state, C, "멤버 C", clock);
  bootstrapGroup(state, A, "PIXEL CLAW CLUB", clock);
  acceptInvitation(state, B, createInvitation(state, A, clock).token, clock);
  acceptInvitation(state, C, createInvitation(state, A, clock).token, clock);
  return state;
}

function play(over: Partial<SavePlayInput> = {}): SavePlayInput {
  return {
    storeId: "",
    visitId: null,
    newVisit: true,
    playedAt: "2026-10-20T03:00:00.000Z",
    attemptCount: 1,
    winCount: 0,
    amountSpent: 1000,
    machineLabel: "",
    notes: "",
    prizes: [],
    idempotencyKey: crypto.randomUUID(),
    confirmFingerprint: null,
    ...over,
  };
}

describe("membership", () => {
  it("caps the group at three active members and burns invitations", () => {
    const clock = at("2026-10-20T03:00:00.000Z");
    const state = setup(clock);
    registerProfile(state, D, "멤버 D", clock);
    const overflow = createInvitation(state, A, clock);
    expect(() => acceptInvitation(state, D, overflow.token, clock)).toThrow(/세 명/);
    const expired = createInvitation(state, A, clock);
    const invite = state.invitations.find((item) => item.id === expired.invitationId);
    if (!invite) {
      throw new Error("missing invite");
    }
    invite.expiresAt = "2026-10-01T00:00:00.000Z";
    expect(() => acceptInvitation(state, D, expired.token, clock)).toThrow(/만료/);
    expect(invite.revokedAt).not.toBeNull();
    const reused = createInvitation(state, A, clock);
    state.members.find((member) => member.userId === C)!.status = "REVOKED";
    acceptInvitation(state, C, reused.token, clock);
    expect(() => acceptInvitation(state, D, reused.token, clock)).toThrow(/사용/);
    expect(state.members.filter((member) => member.status === "ACTIVE")).toHaveLength(3);
    expect(state.invitations.some((item) => JSON.stringify(item).includes(reused.token))).toBe(false);
  });
});

describe("records, budget, and privacy", () => {
  it("separates visits from attempts and keeps week math across edits", () => {
    const clock = at("2026-10-20T03:00:00.000Z");
    const state = setup(clock);
    const store = createStore(
      state,
      A,
      { name: "달빛오락실", address: "서울", latitude: null, longitude: null, notes: "", acknowledgeDuplicate: false },
      clock,
    );
    const sunday = seoulWallToUtc(2026, 10, 18, 23, 59, 0).toISOString();
    const savedSunday = savePlayRecord(
      state,
      A,
      play({ storeId: store.id, playedAt: sunday, amountSpent: 9000, idempotencyKey: crypto.randomUUID() }),
      clock,
    );
    expect(savedSunday.status).toBe("saved");
    expect(personalBudget(state, A, new Date("2026-10-20T03:00:00.000Z")).week.spent).toBe(0);
    const monday = seoulWallToUtc(2026, 10, 19, 0, 0, 0).toISOString();
    const first = savePlayRecord(
      state,
      A,
      play({ storeId: store.id, playedAt: monday, amountSpent: 9000, idempotencyKey: crypto.randomUUID() }),
      clock,
    );
    expect(first.status).toBe("saved");
    const pending = savePlayRecord(
      state,
      A,
      play({ storeId: store.id, playedAt: monday, amountSpent: 2000, idempotencyKey: "55555555-5555-4555-8555-555555555555" }),
      clock,
    );
    expect(pending.status).toBe("confirmation_required");
    if (pending.status !== "confirmation_required") {
      return;
    }
    expect(state.playRecords.filter((record) => record.playedAt === monday)).toHaveLength(1);
    const sneak = savePlayRecord(
      state,
      A,
      play({ storeId: store.id, playedAt: monday, amountSpent: 500, idempotencyKey: crypto.randomUUID() }),
      clock,
    );
    expect(sneak.status).toBe("saved");
    const stale = savePlayRecord(
      state,
      A,
      play({
        storeId: store.id,
        playedAt: monday,
        amountSpent: 2000,
        idempotencyKey: "55555555-5555-4555-8555-555555555555",
        confirmFingerprint: pending.projection.fingerprint,
      }),
      clock,
    );
    expect(stale.status).toBe("confirmation_required");
    if (stale.status !== "confirmation_required") {
      return;
    }
    const confirmed = savePlayRecord(
      state,
      A,
      play({
        storeId: store.id,
        playedAt: monday,
        amountSpent: 2000,
        idempotencyKey: "55555555-5555-4555-8555-555555555555",
        confirmFingerprint: stale.projection.fingerprint,
      }),
      clock,
    );
    expect(confirmed.status).toBe("saved");
    expect(personalBudget(state, A, new Date(monday)).week.state).toBe("OVER");
    const again = savePlayRecord(
      state,
      A,
      play({
        storeId: store.id,
        playedAt: monday,
        amountSpent: 2000,
        idempotencyKey: "55555555-5555-4555-8555-555555555555",
        confirmFingerprint: stale.projection.fingerprint,
      }),
      clock,
    );
    expect(again).toMatchObject({ status: "saved", idempotent: true });
    expect(state.financialRecords.filter((row) => row.amountSpent === 2000)).toHaveLength(1);
    if (confirmed.status !== "saved") {
      return;
    }
    const removed = setPlayRecordDeleted(state, A, confirmed.recordId, true, null, clock);
    expect(removed.status).toBe("saved");
    expect(personalBudget(state, A, new Date(monday)).week.spent).toBe(9500);
    const restored = setPlayRecordDeleted(state, A, confirmed.recordId, false, null, clock);
    expect(restored.status).toBe("confirmation_required");
    if (restored.status !== "confirmation_required") {
      return;
    }
    expect(
      setPlayRecordDeleted(state, A, confirmed.recordId, false, restored.projection.fingerprint, clock).status,
    ).toBe("saved");
    expect(() =>
      updatePlayRecord(
        state,
        B,
        {
          recordId: confirmed.recordId,
          playedAt: monday,
          attemptCount: 1,
          winCount: 0,
          amountSpent: 1,
          machineLabel: "",
          notes: "",
          confirmFingerprint: null,
        },
        clock,
      ),
    ).toThrow(/다른 멤버/);
  });

  it("hides private amounts from the other member across reads", () => {
    const clock = at("2026-10-20T03:00:00.000Z");
    const state = setup(clock);
    const store = createStore(
      state,
      A,
      { name: "별오락실", address: "서울시", latitude: 37.5, longitude: 127, notes: "", acknowledgeDuplicate: false },
      clock,
    );
    const saved = savePlayRecord(
      state,
      A,
      play({
        storeId: store.id,
        amountSpent: 4321,
        winCount: 1,
        prizes: [{ name: "토끼", category: "동물", description: "", visibility: "PRIVATE" }],
      }),
      clock,
    );
    expect(saved.status).toBe("saved");
    const hiddenRecords = JSON.stringify(listRecordViews(state, B));
    const hiddenRank = JSON.stringify(rankingBoard(state, B, "week", clock()));
    const hiddenWeek = JSON.stringify(disclosedWeekly(state, B, clock()));
    const hiddenStore = JSON.stringify(storeSpending(state, B, store.id));
    expect(hiddenRecords).not.toContain("4321");
    expect(hiddenRank).not.toContain("4321");
    expect(hiddenWeek).not.toContain("4321");
    expect(hiddenStore).not.toContain("4321");
    expect(personalBudget(state, A, clock()).week.spent).toBe(4321);
    expect(listPrizeViews(state, B)).toHaveLength(0);
    updatePrivacy(state, A, { showIndividualRecordAmounts: "GROUP" }, clock);
    expect(listRecordViews(state, B)[0]?.amount.amount).toBe(4321);
    expect(JSON.stringify(disclosedWeekly(state, B, clock()))).not.toContain("4321");
    updatePrivacy(state, A, { showWeeklySpending: "GROUP" }, clock);
    expect(disclosedWeekly(state, B, clock()).peers[0]?.spent).toBe(4321);
    const value = rankingBoard(state, B, "all", clock()).categories.find((category) => category.id === "value");
    expect(value?.rows.some((row) => row.memberId === A)).toBe(false);
    updatePrivacy(state, A, { showTotalSpending: "GROUP" }, clock);
    const disclosedValue = rankingBoard(state, B, "all", clock()).categories.find((category) => category.id === "value");
    expect(disclosedValue?.rows.some((row) => row.memberId === A)).toBe(true);
    expect(disclosedValue?.definitive).toBe(false);
  });
});

describe("revenge, prizes, and village", () => {
  it("completes revenge only after confirmation and drops it from rankings when the record is deleted", () => {
    const clock = at("2026-10-20T03:00:00.000Z");
    const state = setup(clock);
    const store = createStore(
      state,
      B,
      { name: "복수오락실", address: "부산", latitude: null, longitude: null, notes: "", acknowledgeDuplicate: false },
      clock,
    );
    const target = createRevenge(
      state,
      A,
      { storeId: store.id, assignedMemberId: B, reason: "지난번에 놓침", notes: "" },
      clock,
    );
    const saved = savePlayRecord(
      state,
      B,
      play({ storeId: store.id, winCount: 1, amountSpent: 500, prizes: [] }),
      clock,
    );
    expect(target.status).toBe("ACTIVE");
    if (saved.status !== "saved") {
      throw new Error("save failed");
    }
    expect(() => completeRevenge(state, B, target.id, saved.recordId, false, clock)).toThrow(/확인/);
    expect(completeRevenge(state, B, target.id, saved.recordId, true, clock).idempotent).toBe(false);
    expect(completeRevenge(state, B, target.id, saved.recordId, true, clock).idempotent).toBe(true);
    expect(rankingBoard(state, A, "week", clock()).categories.find((category) => category.id === "revenge")?.rows[0]?.value).toBe(1);
    setPlayRecordDeleted(state, B, saved.recordId, true, null, clock);
    expect(state.revengeTargets[0]?.needsReview).toBe(true);
    expect(
      rankingBoard(state, A, "week", clock()).categories.find((category) => category.id === "revenge")?.rows[0]?.value,
    ).toBe(0);
    const prize = createPrize(
      state,
      A,
      { name: "공개곰", category: "동물", description: "", visibility: "GROUP", acquisitionPlayRecordId: null },
      clock,
    );
    const original = attachOriginalAsset(state, A, prize.id, "original/path.png", clock);
    const originalPath = state.prizeAssets.find((asset) => asset.assetType === "original")?.storagePath;
    failPixelJob(state, A, original.id, "변환에 실패했습니다.", clock);
    const retry = retryPixelJob(state, A, prize.id, clock);
    completePixelJob(state, A, retry.id, { thumbnail: "thumb.png", pixel: "pixel.png" }, clock);
    expect(state.prizeAssets.find((asset) => asset.assetType === "original")?.storagePath).toBe(originalPath);
    const village = villageView(state, B, clock);
    expect(village.characters.map((character) => character.prizeId)).toEqual([prize.id]);
    villageView(state, B, clock);
    expect(state.villageCharacters).toHaveLength(1);
    expect(village.characters[0]?.spriteKind).toBe("pixel");
  });
});
