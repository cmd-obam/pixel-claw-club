"use client";

import { useState } from "react";
import type { MutationResult } from "@/server/data";

export function PhotoForm({
  prizeId,
  retry,
  action,
}: {
  prizeId: string;
  retry: boolean;
  action: (formData: FormData) => Promise<MutationResult>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="space-y-2 rounded-3xl bg-card p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await action(new FormData(event.currentTarget));
        setMessage(result.message);
      }}
    >
      <p className="text-sm font-medium">{retry ? "픽셀 이미지 다시 생성" : "원본 사진"}</p>
      <p className="text-xs leading-5 text-ink/70">픽셀 변환은 색을 줄인 이미지이며 캐릭터 일러스트가 아닙니다. 배경은 자동으로 지우지 않습니다. 실패해도 원본과 인형 기록은 남습니다.</p>
      <input type="hidden" name="prizeId" value={prizeId} />
      {retry ? <input type="hidden" name="retry" value="1" /> : null}
      <input name="file" type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-sm" />
      <button className="min-h-12 w-full rounded-full bg-grass text-white" type="submit">
        {retry ? "다시 생성" : "올리고 픽셀로 만들기"}
      </button>
      {message ? <p className="text-sm">{message}</p> : null}
    </form>
  );
}
