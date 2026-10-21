import { createHash, randomBytes, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { connection } from "next/server";
import { z } from "zod";
import type { MutationResult } from "@/server/data";
import { pixelFriends } from "@/components/pixel-friends";
import {
  ENTER_GENERIC_MESSAGE,
  ENTER_LOCK_MESSAGE,
  PASSWORD_MESSAGE,
  normalizeNickname,
  normalizePassword,
  parseSlot,
} from "@/server/pin-policy";
import { createSupabaseAdmin } from "@/server/supabase/admin";
import { createSupabaseServer } from "@/server/supabase/server";

const directoryRowSchema = z.object({
  character_slot: z.number().int().min(1).max(3),
  user_id: z.string().uuid(),
  nickname: z.string(),
  active: z.boolean(),
});

export interface LoginRoster {
  memberCount: number;
  capacity: number;
  notice: string | null;
}

const CLUB_CAPACITY = 3;

function missingSchema(message: string): boolean {
  return (
    message.includes("member_credentials") ||
    message.includes("auth_throttle") ||
    message.includes("register_club_member") ||
    message.includes("register_club_member_auto") ||
    message.includes("change_my_character") ||
    message.includes("record_auth_failure") ||
    message.includes("auth_subject_locked")
  );
}

function directoryMissing(error: { code?: string; message: string }): boolean {
  return error.code === "PGRST202" || error.message.includes("club_login_directory");
}

function schemaMessage(): MutationResult {
  return { ok: false, message: "멤버 등록 SQL이 아직 적용되지 않았습니다." };
}

async function clientIpHash(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headerList.get("x-real-ip")?.trim() || "local";
  return createHash("sha256").update(`ip:${ip}`).digest("hex");
}

export async function loadLoginRoster(): Promise<LoginRoster> {
  await connection();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { memberCount: 0, capacity: CLUB_CAPACITY, notice: "서버 인증 설정이 완료되지 않았습니다." };
  }
  const admin = createSupabaseAdmin();
  const directory = await admin.rpc("club_login_directory");
  if (!directory.error) {
    const rows = directoryRowSchema.array().parse(directory.data ?? []);
    return {
      memberCount: rows.filter((row) => row.active).length,
      capacity: CLUB_CAPACITY,
      notice: null,
    };
  }
  if (!directoryMissing(directory.error)) {
    return { memberCount: 0, capacity: CLUB_CAPACITY, notice: "캐릭터 목록을 불러오지 못했습니다." };
  }
  const { count, error } = await admin.from("member_credentials").select("user_id", { count: "exact", head: true });
  if (error) {
    if (missingSchema(error.message)) {
      return { memberCount: 0, capacity: CLUB_CAPACITY, notice: "멤버 등록 SQL이 아직 적용되지 않았습니다." };
    }
    return { memberCount: 0, capacity: CLUB_CAPACITY, notice: "캐릭터 목록을 불러오지 못했습니다." };
  }
  return { memberCount: count ?? 0, capacity: CLUB_CAPACITY, notice: null };
}

async function assertIpOpen(admin: ReturnType<typeof createSupabaseAdmin>, ipHash: string): Promise<MutationResult | null> {
  const { data, error } = await admin.rpc("auth_subject_locked", { p_subject_hash: ipHash });
  if (error) {
    if (missingSchema(error.message)) {
      return schemaMessage();
    }
    return { ok: false, message: ENTER_GENERIC_MESSAGE };
  }
  if (data === true) {
    return { ok: false, message: ENTER_LOCK_MESSAGE };
  }
  return null;
}

async function noteIpFailure(admin: ReturnType<typeof createSupabaseAdmin>, ipHash: string): Promise<MutationResult | null> {
  const { error } = await admin.rpc("record_auth_failure", { p_subject_hash: ipHash });
  if (error) {
    if (missingSchema(error.message)) {
      return schemaMessage();
    }
    return { ok: false, message: ENTER_GENERIC_MESSAGE };
  }
  return null;
}

async function memberEmail(admin: ReturnType<typeof createSupabaseAdmin>, userId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user?.email) {
    return null;
  }
  return data.user.email;
}

async function signInMember(email: string, password: string): Promise<{
  ok: boolean;
  userId: string | null;
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>;
}> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { ok: !error && Boolean(data.user), userId: data.user?.id ?? null, supabase };
}

async function assertActiveMember(signed: {
  ok: boolean;
  userId: string | null;
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>;
}): Promise<boolean> {
  if (!signed.ok || !signed.userId) {
    return false;
  }
  const { data, error } = await signed.supabase
    .from("group_members")
    .select("status")
    .eq("user_id", signed.userId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (error || !data) {
    await signed.supabase.auth.signOut();
    return false;
  }
  return true;
}

function registerFailure(message: string): MutationResult {
  if (message.includes("nickname taken")) {
    return { ok: false, message: "이미 사용 중인 닉네임입니다." };
  }
  if (message.includes("group is full")) {
    return { ok: false, message: "원정대는 세 명까지예요." };
  }
  if (message.includes("character taken")) {
    return { ok: false, message: "이미 등록된 캐릭터입니다." };
  }
  if (missingSchema(message)) {
    return schemaMessage();
  }
  return { ok: false, message: ENTER_GENERIC_MESSAGE };
}

async function registerMember(
  admin: ReturnType<typeof createSupabaseAdmin>,
  nickname: string,
  password: string,
  ipHash: string,
): Promise<MutationResult> {
  const nick = normalizeNickname(nickname);
  if (!nick) {
    const failure = await noteIpFailure(admin, ipHash);
    return failure ?? { ok: false, message: "닉네임은 1~20자로 입력해 주세요." };
  }
  const secret = normalizePassword(password);
  if (!secret) {
    const failure = await noteIpFailure(admin, ipHash);
    return failure ?? { ok: false, message: PASSWORD_MESSAGE };
  }
  const email = `${randomUUID()}@members.pixelclaw.invalid`;
  const created = await admin.auth.admin.createUser({
    email,
    password: secret,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    console.error("club member createUser failed");
    return { ok: false, message: "계정을 만들지 못했습니다. 서버 인증 설정을 확인해 주세요." };
  }
  const userId = created.data.user.id;
  const registered = await admin.rpc("register_club_member_auto", {
    p_user_id: userId,
    p_nickname: nick,
  });
  if (registered.error) {
    await admin.auth.admin.deleteUser(userId);
    return registerFailure(registered.error.message);
  }
  const characterSlot = z.number().int().min(1).max(3).parse(registered.data);
  const signedIn = await signInMember(email, secret);
  if (!signedIn.ok || !(await assertActiveMember(signedIn))) {
    return { ok: false, message: "등록은 끝났습니다. 같은 닉네임과 비밀번호로 다시 입장해 주세요." };
  }
  await admin.rpc("clear_auth_failure", { p_subject_hash: ipHash });
  return {
    ok: true,
    message: "",
    characterSlot,
    characterName: pixelFriends.find((friend) => friend.slot === characterSlot)?.name ?? "캐릭터",
  };
}

export async function enterClub(input: {
  mode: "join" | "login";
  nickname: string;
  password: string;
  passwordConfirm: string;
}): Promise<MutationResult> {
  const admin = createSupabaseAdmin();
  const ipHash = await clientIpHash();
  const locked = await assertIpOpen(admin, ipHash);
  if (locked) {
    return locked;
  }
  const secret = normalizePassword(input.password);
  if (!secret) {
    const failure = await noteIpFailure(admin, ipHash);
    return failure ?? { ok: false, message: PASSWORD_MESSAGE };
  }
  if (input.mode === "join") {
    if (input.password !== input.passwordConfirm) {
      const failure = await noteIpFailure(admin, ipHash);
      return failure ?? { ok: false, message: "비밀번호 확인이 일치하지 않습니다." };
    }
    return registerMember(admin, input.nickname, secret, ipHash);
  }
  const nick = normalizeNickname(input.nickname);
  if (!nick) {
    const failure = await noteIpFailure(admin, ipHash);
    return failure ?? { ok: false, message: "닉네임은 1~20자로 입력해 주세요." };
  }
  const directory = await admin.rpc("club_login_directory");
  if (directory.error) {
    if (directoryMissing(directory.error) || missingSchema(directory.error.message)) {
      return schemaMessage();
    }
    return { ok: false, message: ENTER_GENERIC_MESSAGE };
  }
  const rows = directoryRowSchema.array().parse(directory.data ?? []);
  const match = rows.find(
    (row) => row.active && row.nickname.localeCompare(nick, "ko", { sensitivity: "accent" }) === 0,
  );
  if (!match) {
    const failure = await noteIpFailure(admin, ipHash);
    return failure ?? { ok: false, message: "닉네임 또는 비밀번호가 올바르지 않습니다." };
  }
  const email = await memberEmail(admin, match.user_id);
  if (!email) {
    return { ok: false, message: "세션을 만들지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  const signedIn = await signInMember(email, secret);
  if (!signedIn.ok) {
    const failure = await noteIpFailure(admin, ipHash);
    return failure ?? { ok: false, message: "닉네임 또는 비밀번호가 올바르지 않습니다." };
  }
  if (!(await assertActiveMember(signedIn))) {
    return { ok: false, message: "이 계정으로는 입장할 수 없습니다." };
  }
  await admin.rpc("clear_auth_failure", { p_subject_hash: ipHash });
  return { ok: true, message: "" };
}

export async function changeOwnPassword(current: string, next: string, confirm: string): Promise<MutationResult> {
  const currentSecret = normalizePassword(current);
  const nextSecret = normalizePassword(next);
  if (!currentSecret || !nextSecret) {
    return { ok: false, message: PASSWORD_MESSAGE };
  }
  if (next !== confirm) {
    return { ok: false, message: "비밀번호 확인이 일치하지 않습니다." };
  }
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (error || !email) {
    return { ok: false, message: ENTER_GENERIC_MESSAGE };
  }
  const signed = await supabase.auth.signInWithPassword({ email, password: currentSecret });
  if (signed.error) {
    return { ok: false, message: "현재 비밀번호가 올바르지 않습니다." };
  }
  const updated = await supabase.auth.updateUser({ password: nextSecret });
  if (updated.error) {
    return { ok: false, message: "비밀번호를 바꾸지 못했습니다." };
  }
  return { ok: true, message: "비밀번호를 바꿨습니다. 다음 입장부터 새 비밀번호를 사용해 주세요." };
}

export async function changeMyCharacter(slot: unknown): Promise<MutationResult> {
  const parsed = parseSlot(slot);
  if (!parsed) {
    return { ok: false, message: "캐릭터를 선택해 주세요." };
  }
  const supabase = await createSupabaseServer();
  const { error } = await supabase.rpc("change_my_character", { p_slot: parsed });
  if (error) {
    if (error.message.includes("character taken")) {
      return { ok: false, message: "이미 다른 원정대원이 쓰는 캐릭터입니다." };
    }
    if (missingSchema(error.message) || error.code === "PGRST202") {
      return { ok: false, message: "캐릭터 변경 SQL이 아직 적용되지 않았습니다." };
    }
    return { ok: false, message: "캐릭터를 바꾸지 못했습니다." };
  }
  return { ok: true, message: "캐릭터를 바꿨습니다." };
}

export interface CharacterCard {
  slot: number | null;
  name: string;
  prizeCount: number | null;
  choices: Array<{ slot: number; name: string }>;
}

export async function loadCharacterCard(): Promise<CharacterCard> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id ?? null;
  let rows: Array<z.infer<typeof directoryRowSchema>> = [];
  let directoryOk = false;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const directory = await createSupabaseAdmin().rpc("club_login_directory");
    if (!directory.error) {
      directoryOk = true;
      rows = directoryRowSchema.array().parse(directory.data ?? []);
    }
  }
  const mine = rows.find((row) => row.user_id === userId) ?? null;
  const taken = new Set(rows.map((row) => row.character_slot));
  const prizes = userId
    ? await supabase.from("prizes").select("id", { count: "exact", head: true }).eq("owner_member_id", userId).is("deleted_at", null)
    : { count: null, error: null };
  const current = pixelFriends.find((friend) => friend.slot === mine?.character_slot);
  return {
    slot: mine?.character_slot ?? null,
    name: current?.name ?? (directoryOk ? "미배정" : "캐릭터 목록을 불러오지 못했습니다"),
    prizeCount: prizes.error ? null : (prizes.count ?? 0),
    choices: directoryOk
      ? pixelFriends
          .filter((friend) => friend.slot === mine?.character_slot || !taken.has(friend.slot))
          .map((friend) => ({ slot: friend.slot, name: friend.name }))
      : [],
  };
}

export async function releaseCharacterSlot(userId: string): Promise<boolean> {
  if (!z.string().uuid().safeParse(userId).success || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return false;
  }
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("member_credentials").delete().eq("user_id", userId);
  if (error) {
    if (missingSchema(error.message)) {
      return true;
    }
    return false;
  }
  const password = randomBytes(32).toString("base64url");
  await admin.auth.admin.updateUserById(userId, { password });
  return true;
}
