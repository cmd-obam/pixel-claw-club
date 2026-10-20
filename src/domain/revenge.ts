export type RevengeStatus = "ACTIVE" | "COMPLETED" | "ABANDONED";

export const REVENGE_LABELS: Record<RevengeStatus, string> = {
  ACTIVE: "복수 대기",
  COMPLETED: "재도전 완료",
  ABANDONED: "오늘은 여기까지",
};

export interface RevengeCompletionInput {
  targetStoreId: string;
  targetStatus: RevengeStatus;
  assignedMemberId: string;
  record: {
    id: string;
    storeId: string;
    playerId: string;
    winCount: number;
    deletedAt: string | null;
    playedAt: Date;
  } | null;
  now: Date;
  alreadyCompletedRecordId: string | null;
}

export type RevengeCompletionDecision =
  | { ok: true; idempotent: boolean; completedAt: Date }
  | { ok: false; message: string };

export function decideRevengeCompletion(
  input: RevengeCompletionInput,
): RevengeCompletionDecision {
  if (input.targetStatus === "COMPLETED") {
    if (
      input.alreadyCompletedRecordId &&
      input.record &&
      !input.record.deletedAt &&
      input.alreadyCompletedRecordId === input.record.id
    ) {
      return { ok: true, idempotent: true, completedAt: input.now };
    }
    if (input.record?.deletedAt) {
      return { ok: false, message: "연결된 성공 기록이 삭제되어 다시 확인이 필요합니다." };
    }
    return { ok: false, message: "이미 완료된 복수 목표입니다." };
  }
  if (input.targetStatus === "ABANDONED") {
    return { ok: false, message: "오늘은 여기까지로 표시된 목표는 완료할 수 없습니다." };
  }
  if (!input.record || input.record.deletedAt) {
    return { ok: false, message: "연결할 성공 기록을 찾을 수 없습니다." };
  }
  if (input.record.winCount < 1) {
    return { ok: false, message: "성공이 기록된 플레이만 복수를 완료할 수 있습니다." };
  }
  if (input.record.storeId !== input.targetStoreId) {
    return { ok: false, message: "같은 매장의 성공 기록만 연결할 수 있습니다." };
  }
  if (input.record.playerId !== input.assignedMemberId) {
    return { ok: false, message: "담당 멤버의 성공 기록만 연결할 수 있습니다." };
  }
  if (input.record.playedAt.getTime() > input.now.getTime()) {
    return { ok: false, message: "완료 시각이 플레이 시각보다 앞설 수 없습니다." };
  }
  return { ok: true, idempotent: false, completedAt: input.now };
}
