"use client";

import { useState } from "react";
import type { MutationResult } from "@/server/data";

export function AuthForms({ action }: { action: (formData: FormData) => Promise<MutationResult> }) {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const submitter = event.nativeEvent instanceof SubmitEvent ? event.nativeEvent.submitter : null;
        if (submitter instanceof HTMLButtonElement) {
          data.set(submitter.name, submitter.value);
        }
        const result = await action(data);
        setMessage(result.message);
      }}
    >
      <input name="email" type="email" required placeholder="이메일" className="min-h-12 w-full rounded-2xl border border-cream-deep px-3" />
      <input name="password" type="password" required minLength={8} placeholder="비밀번호" className="min-h-12 w-full rounded-2xl border border-cream-deep px-3" />
      <div className="grid grid-cols-2 gap-2">
        <button name="mode" value="sign-in" className="min-h-12 rounded-full bg-grass text-white" type="submit">로그인</button>
        <button name="mode" value="sign-up" className="min-h-12 rounded-full bg-lavender" type="submit">가입</button>
      </div>
      <p className="text-xs leading-5">가입해도 그룹 멤버가 되지 않습니다.</p>
      {message ? <p className="text-sm">{message}</p> : null}
    </form>
  );
}
