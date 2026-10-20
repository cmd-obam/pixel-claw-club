"use client";

export default function ClubError({ error, retry }: { error: unknown; retry: () => void }) {
  const message = error instanceof Error ? error.message : "화면을 불러오지 못했습니다.";
  return (
    <div className="rounded-3xl bg-card p-4">
      <h1 className="text-lg font-bold">문제가 발생했습니다</h1>
      <p className="mt-2 text-sm leading-6">{message}</p>
      <button type="button" onClick={() => retry()} className="mt-4 min-h-12 rounded-full bg-grass px-4 text-white">
        다시 시도
      </button>
    </div>
  );
}
