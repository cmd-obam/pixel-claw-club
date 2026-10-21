"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { MutationResult } from "@/server/data";
import type { LoginRoster } from "@/server/pin-login";
import { pixelFriends } from "@/components/pixel-friends";
import { PixelSprite } from "@/components/pixel-sprite";

const initial: MutationResult = { ok: false, message: "" };

export function ClubLogin({
  roster,
  action,
}: {
  roster: LoginRoster;
  action: (state: MutationResult, formData: FormData) => Promise<MutationResult>;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, initial);
  const [mode, setMode] = useState<"join" | "login">(roster.memberCount >= roster.capacity ? "login" : "join");
  const closed = roster.memberCount >= roster.capacity;
  const revealed = state.ok && state.characterSlot ? pixelFriends.find((friend) => friend.slot === state.characterSlot) : null;

  useEffect(() => {
    if (!revealed) {
      return;
    }
    const timer = window.setTimeout(() => router.push("/"), 1800);
    return () => window.clearTimeout(timer);
  }, [revealed, router]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center bg-pink px-4 py-8">
      <form action={formAction} className="space-y-4 rounded-[28px] bg-card p-5 shadow-sm">
        <p className="text-center text-xs font-bold tracking-[0.18em] text-ink/70">PIXEL CLAW CLUB</p>
        <h1 className="text-center text-2xl font-bold">우리들의 뽑기 원정대</h1>
        <p className="text-center text-sm">
          등록 {roster.memberCount}/{roster.capacity}명
          {closed ? " · 가입이 마감되었습니다" : ""}
        </p>
        {roster.notice ? <p className="rounded-2xl bg-white px-3 py-2 text-sm">{roster.notice}</p> : null}
        {state.message ? <p className="rounded-2xl bg-white px-3 py-2 text-sm">{state.message}</p> : null}
        {revealed ? <CharacterReveal slot={revealed.slot} /> : (
          <>
            <label className="block text-sm font-semibold">
              닉네임
              <input name="nickname" minLength={1} maxLength={20} autoComplete="nickname" className="mt-1 min-h-12 w-full rounded-2xl border px-3" required />
            </label>
            <label className="block text-sm font-semibold">
              개인 비밀번호
              <input name="password" type="password" minLength={8} maxLength={64} autoComplete={mode === "join" ? "new-password" : "current-password"} placeholder="8자 이상" className="mt-1 min-h-12 w-full rounded-2xl border px-3" required />
            </label>
            {mode === "join" && !closed ? (
              <label className="block text-sm font-semibold">
                비밀번호 확인
                <input name="passwordConfirm" type="password" minLength={8} maxLength={64} autoComplete="new-password" className="mt-1 min-h-12 w-full rounded-2xl border px-3" required />
              </label>
            ) : null}
            <input type="hidden" name="mode" value={closed ? "login" : mode} />
            <button className="min-h-12 w-full rounded-full bg-ink px-4 font-semibold text-white disabled:opacity-60" type="submit" disabled={pending}>
              {pending ? "처리하는 중" : mode === "join" && !closed ? "원정대 가입하기" : "원정대 입장하기"}
            </button>
            {closed ? null : (
              <button
                className="min-h-11 w-full text-sm"
                type="button"
                onClick={() => setMode((current) => (current === "join" ? "login" : "join"))}
              >
                {mode === "join" ? "이미 가입했다면 로그인" : "처음이라면 가입하기"}
              </button>
            )}
          </>
        )}
      </form>
    </main>
  );
}

function CharacterReveal({ slot }: { slot: number }) {
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let ticks = 0;
    const timer = window.setInterval(() => {
      ticks += 1;
      if (ticks >= 8) {
        window.clearInterval(timer);
        setDone(true);
        return;
      }
      setIndex((current) => (current + 1) % pixelFriends.length);
    }, 120);
    return () => window.clearInterval(timer);
  }, []);
  const friend = done ? (pixelFriends.find((item) => item.slot === slot) ?? pixelFriends[0]) : pixelFriends[index];
  if (!friend) {
    return null;
  }
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl bg-white px-4 py-6">
      <PixelSprite rows={friend.rows} label={friend.name} className="h-24 w-24" />
      <p className="text-lg font-bold">{done ? friend.name : "뽑는 중"}</p>
      <p className="text-sm">{done ? "이 캐릭터로 원정대를 시작합니다." : "남은 캐릭터 중에서 고르는 중입니다."}</p>
    </div>
  );
}
