import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pixelFriends } from "@/components/pixel-friends";
import { normalizeNickname, normalizePassword, parseSlot } from "@/server/pin-policy";

const memberSql = readFileSync(path.join(process.cwd(), "supabase/migrations/20261021000004_pin_auth.sql"), "utf8");
const authSql = readFileSync(path.join(process.cwd(), "supabase/migrations/20261021000005_club_member_auth.sql"), "utf8");
const directorySql = readFileSync(path.join(process.cwd(), "supabase/migrations/20261021000006_login_directory.sql"), "utf8");
const randomSql = readFileSync(path.join(process.cwd(), "supabase/migrations/20261022000001_random_character.sql"), "utf8");
const cleanupSql = readFileSync(path.join(process.cwd(), "supabase/migrations/20261022000002_remove_verify_a.sql"), "utf8");
const initSql = readFileSync(path.join(process.cwd(), "supabase/migrations/20261020000001_init.sql"), "utf8");
const mutationSql = readFileSync(path.join(process.cwd(), "supabase/migrations/20261020000002_mutations.sql"), "utf8");
const loginSource = readFileSync(path.join(process.cwd(), "src/server/pin-login.ts"), "utf8");

describe("nickname login", () => {
  it("accepts a short nickname and a character slot", () => {
    expect(normalizeNickname("  냥집게  ")).toBe("냥집게");
    expect(normalizeNickname("")).toBeNull();
    expect(normalizeNickname("가".repeat(21))).toBeNull();
    expect(parseSlot("2")).toBe(2);
    expect(parseSlot("4")).toBeNull();
    expect(normalizePassword("secret-pass")).toBe("secret-pass");
    expect(normalizePassword("short")).toBeNull();
    expect(normalizePassword("가".repeat(65))).toBeNull();
  });

  it("draws three fixed 16 by 16 characters", () => {
    expect(pixelFriends.map((friend) => friend.slot)).toEqual([1, 2, 3]);
    for (const friend of pixelFriends) {
      expect(friend.rows).toHaveLength(16);
      for (const row of friend.rows) {
        expect(row).toHaveLength(16);
      }
    }
  });

  it("keeps member slots away from browser roles", () => {
    expect(memberSql).toContain("REVOKE ALL ON public.member_credentials FROM PUBLIC, anon, authenticated");
    expect(memberSql).toContain("REVOKE ALL ON public.auth_throttle FROM PUBLIC, anon, authenticated");
    expect(memberSql).toContain("active_count >= 3");
    expect(memberSql).toContain("nickname taken");
    expect(memberSql).toContain("GRANT EXECUTE ON FUNCTION public.register_club_member(uuid, text, smallint) TO service_role");
    expect(memberSql).toContain("DROP COLUMN IF EXISTS pin_hash");
    expect(memberSql).toContain("DROP FUNCTION IF EXISTS public.register_pin_member(uuid, text, smallint, text)");
    expect(memberSql).not.toMatch(/pin_hash\s+text/);
    expect(memberSql).not.toContain("TO anon");
    expect(memberSql).not.toContain("TO authenticated");
  });

  it("adds the nickname registration function without deleting rows", () => {
    expect(authSql).toContain("ALTER TABLE public.member_credentials ALTER COLUMN pin_hash DROP NOT NULL");
    expect(authSql).toContain("active_count >= 3");
    expect(authSql).toContain("nickname taken");
    expect(authSql).toContain("character taken");
    expect(authSql).toContain("GRANT EXECUTE ON FUNCTION public.register_club_member(uuid, text, smallint) TO service_role");
    expect(authSql).toContain("REVOKE ALL ON FUNCTION public.register_club_member(uuid, text, smallint) FROM PUBLIC, anon, authenticated");
    expect(authSql).not.toContain("DROP TABLE");
    expect(authSql).not.toContain("TRUNCATE");
    expect(authSql).not.toContain("DROP COLUMN");
    expect(authSql).not.toContain("DROP FUNCTION");
  });

  it("requires the member password before a session and keeps amounts on auth.uid", () => {
    expect(loginSource).not.toContain("generateLink");
    expect(loginSource).not.toContain("verifyOtp");
    expect(loginSource).toContain("signInWithPassword");
    expect(loginSource).toContain("club_login_directory");
    expect(loginSource).toContain("register_club_member_auto");
    expect(loginSource).not.toContain("financial_records");
    expect(loginSource).not.toMatch(/admin[\s\S]{0,80}\.from\("group_members"\)/);
    expect(initSql).toContain("REVOKE ALL ON public.financial_records FROM PUBLIC, anon, authenticated");
    expect(initSql).toContain("f.owner_member_id = auth.uid()");
    expect(initSql).toContain("ELSE NULL");
    expect(initSql).toContain("WHERE f.owner_member_id = uid");
    expect(mutationSql).toContain("gid, visit_id, uid, uid, played");
    expect(mutationSql).toContain("WHERE id = p_id AND player_id = uid");
  });

  it("reads the login roster through a service-only function", () => {
    expect(directorySql).toContain("CREATE OR REPLACE FUNCTION public.club_login_directory()");
    expect(directorySql).toContain("GRANT EXECUTE ON FUNCTION public.club_login_directory() TO service_role");
    expect(directorySql).toContain("REVOKE ALL ON FUNCTION public.club_login_directory() FROM PUBLIC, anon, authenticated");
    expect(directorySql).toContain("prize-assets");
    expect(directorySql).not.toMatch(/GRANT[^\n]*financial_records/);
    expect(directorySql).not.toContain("DISABLE ROW LEVEL SECURITY");
    expect(directorySql).not.toContain("DROP TABLE");
    expect(directorySql).not.toContain("DROP COLUMN");
    expect(directorySql).not.toContain("TRUNCATE");
  });

  it("assigns an unused character inside one locked transaction", () => {
    expect(randomSql).toContain("CREATE OR REPLACE FUNCTION public.register_club_member_auto(");
    expect(randomSql).toContain("pg_advisory_xact_lock(481516234)");
    expect(randomSql).toContain("ORDER BY random()");
    expect(randomSql).toContain("active_count >= 3");
    expect(randomSql).toContain("nickname taken");
    expect(randomSql).toContain("CREATE OR REPLACE FUNCTION public.change_my_character(p_slot smallint)");
    expect(randomSql).toContain("uid uuid := auth.uid()");
    expect(randomSql).toContain("GRANT EXECUTE ON FUNCTION public.register_club_member_auto(uuid, text) TO service_role");
    expect(randomSql).toContain("REVOKE ALL ON FUNCTION public.register_club_member_auto(uuid, text) FROM PUBLIC, anon, authenticated");
    expect(randomSql).toContain("GRANT EXECUTE ON FUNCTION public.change_my_character(smallint) TO authenticated");
    expect(randomSql).not.toMatch(/GRANT[^\n]*financial_records/);
    expect(randomSql).not.toContain("DISABLE ROW LEVEL SECURITY");
    expect(randomSql).not.toContain("DROP TABLE");
    expect(randomSql).not.toContain("DROP COLUMN");
    expect(randomSql).not.toContain("TRUNCATE");
    expect(randomSql).not.toContain("DELETE FROM");
  });

  it("removes only the verified test account and stops when other rows exist", () => {
    expect(cleanupSql).toContain("987fe9c1-77d9-4a0b-869f-2ae2d875916b");
    expect(cleanupSql).toContain("target profile is not 검증A");
    expect(cleanupSql).toContain("another member exists");
    expect(cleanupSql).toContain("DELETE FROM auth.users WHERE id = target");
    expect(cleanupSql).not.toContain("DROP TABLE");
    expect(cleanupSql).not.toContain("DROP COLUMN");
    expect(cleanupSql).not.toContain("TRUNCATE");
    expect(cleanupSql).not.toContain("DISABLE ROW LEVEL SECURITY");
  });
});
