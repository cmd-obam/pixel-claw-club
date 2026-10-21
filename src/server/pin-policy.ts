import type { CharacterSlot, LoginSlot } from "@/domain/login-slots";

export type { CharacterSlot, LoginSlot };

export const ENTER_LOCK_MESSAGE = "잠시 후 다시 시도해 주세요.";
export const ENTER_GENERIC_MESSAGE = "입장할 수 없습니다. 비밀번호를 확인해 주세요.";
export const PASSWORD_MESSAGE = "비밀번호는 8자 이상 64자 이하로 입력해 주세요.";

export function parseSlot(value: unknown): CharacterSlot | null {
  const slot = typeof value === "number" ? value : Number(value);
  if (slot === 1 || slot === 2 || slot === 3) {
    return slot;
  }
  return null;
}

export function normalizeNickname(value: string): string | null {
  const nickname = value.trim();
  if (nickname.length < 1 || nickname.length > 20) {
    return null;
  }
  if (/[\u0000-\u001f]/.test(nickname)) {
    return null;
  }
  return nickname;
}

export function normalizePassword(value: string): string | null {
  if (value.length < 8 || value.length > 64) {
    return null;
  }
  if (/[\u0000-\u001f]/.test(value)) {
    return null;
  }
  return value;
}
