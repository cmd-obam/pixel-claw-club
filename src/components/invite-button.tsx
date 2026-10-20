"use client";

import { useState } from "react";
import type { MutationResult } from "@/server/data";

export function InviteButton({ action }: { action: () => Promise<MutationResult> }) {
  const [token, setToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="rounded-3xl bg-butter p-4">
      <button
        className="min-h-12 rounded-full bg-ink px-4 text-white"
        type="button"
        onClick={async () => {
          const result = await action();
          setMessage(result.message);
          setToken(result.token ?? null);
        }}
      >
        초대 만들기
      </button>
      {token ? <p className="mt-3 break-all text-sm">초대 코드: {token}</p> : null}
      {message ? <p className="mt-2 text-sm">{message}</p> : null}
    </div>
  );
}
