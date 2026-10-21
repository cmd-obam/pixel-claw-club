"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { AppError, isAppError } from "@/domain/errors";
import { privacySchema, savePlaySchema, storeInputSchema, type SavePlayValues } from "@/domain/forms";
import { isProductionConfigured } from "@/server/config";
import { DEMO_COOKIE } from "@/server/demo-accounts";
import { isDemoUserId } from "@/server/demo-accounts";
import { createSupabaseServer } from "@/server/supabase/server";
import {
  acceptInviteToken,
  bootstrapProductionGroup,
  issueInvitation,
  removePrize,
  revokeGroupMember,
  revokeInvite,
  saveSettings,
  storePrizePhoto,
  submitAbandonRevenge,
  submitCompleteRevenge,
  submitDeleteRecord,
  submitPlay,
  submitPrize,
  submitPrizeVisibility,
  submitRevenge,
  submitStore,
  type MutationResult,
} from "@/server/data";
import { changeMyCharacter, changeOwnPassword, enterClub } from "@/server/pin-login";
import { assertRateLimit } from "@/server/rate-limit";

function invalid(error: z.ZodError): MutationResult {
  return { ok: false, message: error.issues[0]?.message ?? "입력값을 확인해 주세요." };
}

export async function signInDemoAction(formData: FormData) {
  if (isProductionConfigured()) {
    throw new AppError("FORBIDDEN", "데모 로그인은 운영 모드에서 사용할 수 없습니다.", 403);
  }
  const userId = String(formData.get("userId") ?? "");
  if (!isDemoUserId(userId)) {
    throw new AppError("AUTH", "데모 계정을 찾을 수 없습니다.");
  }
  assertRateLimit(`demo-login:${userId}`, 10, 60_000);
  const jar = await cookies();
  jar.set(DEMO_COOKIE, userId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 14 });
  redirect("/");
}

export async function signOutAction() {
  if (isProductionConfigured()) {
    const supabase = await createSupabaseServer();
    await supabase.auth.signOut();
  }
  const jar = await cookies();
  jar.delete(DEMO_COOKIE);
  redirect("/auth");
}

export async function enterClubAction(_prev: MutationResult, formData: FormData): Promise<MutationResult> {
  try {
    const mode = formData.get("mode") === "login" ? "login" : "join";
    const result = await enterClub({
      mode,
      nickname: String(formData.get("nickname") ?? ""),
      password: String(formData.get("password") ?? ""),
      passwordConfirm: String(formData.get("passwordConfirm") ?? ""),
    });
    if (!result.ok || result.characterSlot) {
      return result;
    }
  } catch (error) {
    if (isAppError(error)) {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: "입장할 수 없습니다. 비밀번호를 확인해 주세요." };
  }
  redirect("/");
}

export async function changeCharacterAction(_prev: MutationResult, formData: FormData): Promise<MutationResult> {
  const result = await changeMyCharacter(formData.get("slot"));
  if (result.ok) {
    revalidatePath("/settings");
  }
  return result;
}

export async function createStoreAction(values: unknown): Promise<MutationResult> {
  const parsed = storeInputSchema.safeParse(values);
  if (!parsed.success) {
    return invalid(parsed.error);
  }
  const result = await submitStore(parsed.data);
  if (result.ok) {
    revalidatePath("/");
    revalidatePath("/map");
  }
  return result;
}

export async function createRecordAction(values: SavePlayValues): Promise<MutationResult> {
  const parsed = savePlaySchema.safeParse(values);
  if (!parsed.success) {
    return invalid(parsed.error);
  }
  const result = await submitPlay(parsed.data);
  if (result.ok) {
    revalidatePath("/");
    revalidatePath("/records");
    revalidatePath("/budget");
    revalidatePath("/village");
  }
  return result;
}

export async function deleteRecordAction(recordId: string): Promise<void> {
  const result = await submitDeleteRecord(recordId, false, null);
  if (!result.ok) {
    throw new AppError("RECORD", result.message);
  }
  revalidatePath("/records");
  revalidatePath("/budget");
}

export async function restoreRecordAction(recordId: string): Promise<void> {
  const result = await submitDeleteRecord(recordId, true, null);
  if (!result.ok) {
    throw new AppError("RECORD", result.message);
  }
  revalidatePath("/records");
  revalidatePath("/budget");
}

export async function createRevengeAction(formData: FormData): Promise<void> {
  await submitRevenge({
    storeId: String(formData.get("storeId") ?? ""),
    assignedMemberId: String(formData.get("assignedMemberId") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  revalidatePath("/revenge");
  redirect("/revenge");
}

export async function completeRevengeAction(formData: FormData): Promise<void> {
  await submitCompleteRevenge(String(formData.get("targetId") ?? ""), String(formData.get("recordId") ?? ""));
  revalidatePath("/revenge");
  revalidatePath("/rankings");
  redirect("/revenge");
}

export async function abandonRevengeAction(formData: FormData): Promise<void> {
  await submitAbandonRevenge(String(formData.get("targetId") ?? ""));
  revalidatePath("/revenge");
  redirect("/revenge");
}

export async function createPrizeAction(formData: FormData): Promise<void> {
  const visibility = formData.get("visibility") === "GROUP" ? "GROUP" : "PRIVATE";
  const result = await submitPrize({
    name: String(formData.get("name") ?? ""),
    category: String(formData.get("category") ?? "기타"),
    description: String(formData.get("description") ?? ""),
    visibility,
    acquisitionPlayRecordId: null,
  });
  revalidatePath("/collection");
  revalidatePath("/village");
  if (result.id) {
    redirect(`/collection/${result.id}`);
  }
  redirect("/collection");
}

export async function uploadPhotoAction(formData: FormData): Promise<MutationResult> {
  const prizeId = String(formData.get("prizeId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "사진 파일을 선택해 주세요." };
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await storePrizePhoto(prizeId, bytes, formData.get("retry") === "1");
  revalidatePath(`/collection/${prizeId}`);
  revalidatePath("/village");
  return result;
}

export async function visibilityAction(formData: FormData): Promise<void> {
  const visibility = formData.get("visibility") === "GROUP" ? "GROUP" : "PRIVATE";
  await submitPrizeVisibility(String(formData.get("prizeId") ?? ""), visibility);
  revalidatePath("/collection");
  revalidatePath("/village");
}

export async function deletePrizeAction(formData: FormData): Promise<void> {
  await removePrize(String(formData.get("prizeId") ?? ""));
  revalidatePath("/collection");
  revalidatePath("/village");
  redirect("/collection");
}

export async function changePasswordAction(_prev: MutationResult, formData: FormData): Promise<MutationResult> {
  return changeOwnPassword(
    String(formData.get("currentPassword") ?? ""),
    String(formData.get("nextPassword") ?? ""),
    String(formData.get("nextPasswordConfirm") ?? ""),
  );
}

export async function settingsAction(values: unknown): Promise<MutationResult> {
  const parsed = z
    .object({
      nickname: z.string().trim().min(1).max(20),
      weeklyBudget: z.number().int().min(0),
      privacy: privacySchema,
    })
    .safeParse(values);
  if (!parsed.success) {
    return invalid(parsed.error);
  }
  const result = await saveSettings(parsed.data);
  revalidatePath("/settings");
  revalidatePath("/rankings");
  revalidatePath("/");
  return result;
}

export async function inviteAction(): Promise<MutationResult> {
  const result = await issueInvitation();
  revalidatePath("/settings/members");
  return result;
}

export async function acceptAction(formData: FormData): Promise<void> {
  const result = await acceptInviteToken(String(formData.get("token") ?? ""));
  if (!result.ok) {
    redirect(`/auth?error=${encodeURIComponent(result.message)}`);
  }
  revalidatePath("/");
  redirect("/");
}

export async function bootstrapAction(formData: FormData): Promise<void> {
  const result = await bootstrapProductionGroup(String(formData.get("name") ?? "PIXEL CLAW CLUB"));
  if (!result.ok) {
    redirect(`/auth?error=${encodeURIComponent(result.message)}`);
  }
  revalidatePath("/");
  redirect("/");
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  await revokeInvite(String(formData.get("id") ?? ""));
  revalidatePath("/settings/members");
}

export async function revokeMemberAction(formData: FormData): Promise<void> {
  await revokeGroupMember(String(formData.get("userId") ?? ""));
  revalidatePath("/settings/members");
}
