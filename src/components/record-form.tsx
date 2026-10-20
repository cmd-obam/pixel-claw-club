"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { savePlaySchema, type SavePlayValues } from "@/domain/forms";
import { formatKrw } from "@/domain/money";
import type { MutationResult } from "@/server/data";

export function RecordForm({
  stores,
  playedAt,
  action,
}: {
  stores: Array<{ id: string; name: string }>;
  playedAt: string;
  action: (values: SavePlayValues) => Promise<MutationResult>;
}) {
  const router = useRouter();
  const idempotencyKey = useRef(crypto.randomUUID());
  const [message, setMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<MutationResult["confirmation"]>();
  const form = useForm<SavePlayValues>({
    resolver: zodResolver(savePlaySchema),
    defaultValues: {
      storeId: stores[0]?.id ?? "",
      visitId: null,
      newVisit: true,
      playedAt,
      attemptCount: 1,
      winCount: 0,
      amountSpent: 0,
      machineLabel: "",
      notes: "",
      prizes: [],
      idempotencyKey: idempotencyKey.current,
      confirmFingerprint: null,
    },
  });
  const [prizeName, setPrizeName] = useState("");
  const [sharePrize, setSharePrize] = useState(false);
  // eslint-disable-next-line react-hooks/incompatible-library -- prize fields depend on the live win count
  const winCount = form.watch("winCount");

  async function onSubmit(values: SavePlayValues) {
    setMessage(null);
    const prizes =
      winCount > 0 && prizeName.trim()
        ? [{ name: prizeName.trim(), category: "기타", description: "", visibility: sharePrize ? ("GROUP" as const) : ("PRIVATE" as const) }]
        : [];
    const result = await action({ ...values, prizes, idempotencyKey: idempotencyKey.current });
    if (result.confirmation) {
      setConfirmation(result.confirmation);
      form.setValue("confirmFingerprint", result.confirmation.fingerprint);
      setMessage(result.message);
      return;
    }
    setConfirmation(undefined);
    setMessage(result.message);
    if (result.ok && result.id) {
      router.push(`/records/${result.id}`);
      router.refresh();
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <label className="block text-sm font-medium">
        매장
        <select {...form.register("storeId")} className="mt-1 min-h-12 w-full rounded-2xl border border-cream-deep bg-white px-3">
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        플레이 시각 (한국 시간)
        <input type="datetime-local" {...form.register("playedAt")} className="mt-1 min-h-12 w-full rounded-2xl border border-cream-deep bg-white px-3" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-medium">
          시도
          <input type="number" min={1} {...form.register("attemptCount", { valueAsNumber: true })} className="mt-1 min-h-12 w-full rounded-2xl border border-cream-deep bg-white px-3" />
        </label>
        <label className="text-sm font-medium">
          성공
          <input type="number" min={0} {...form.register("winCount", { valueAsNumber: true })} className="mt-1 min-h-12 w-full rounded-2xl border border-cream-deep bg-white px-3" />
        </label>
      </div>
      <label className="block text-sm font-medium">
        이번 판에 쓴 금액 (원)
        <input type="number" min={0} {...form.register("amountSpent", { valueAsNumber: true })} className="mt-1 min-h-12 w-full rounded-2xl border border-cream-deep bg-white px-3" />
      </label>
      <label className="block text-sm font-medium">
        기계 이름
        <input {...form.register("machineLabel")} className="mt-1 min-h-12 w-full rounded-2xl border border-cream-deep bg-white px-3" />
      </label>
      <label className="block text-sm font-medium">
        메모
        <textarea {...form.register("notes")} className="mt-1 min-h-24 w-full rounded-2xl border border-cream-deep bg-white px-3 py-2" />
      </label>
      {winCount > 0 ? (
        <fieldset className="rounded-2xl bg-lavender/50 p-3">
          <legend className="px-1 text-sm font-medium">가져온 인형 (선택)</legend>
          <p className="mb-2 text-xs leading-5">사진이 없어도 저장됩니다. 그룹 공개는 직접 선택해야 마을에 나타납니다.</p>
          <input value={prizeName} onChange={(event) => setPrizeName(event.target.value)} placeholder="인형 이름" className="min-h-12 w-full rounded-2xl border border-cream-deep bg-white px-3" />
          <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={sharePrize} onChange={(event) => setSharePrize(event.target.checked)} />
            그룹 도감과 마을에 공개
          </label>
        </fieldset>
      ) : null}
      {confirmation ? (
        <div className="rounded-2xl bg-butter p-3 text-sm leading-6">
          <p>현재 {formatKrw(confirmation.spentBefore)}에서 {formatKrw(confirmation.projected)}이 됩니다.</p>
          <p>예산 {formatKrw(confirmation.budget)}보다 {formatKrw(confirmation.excess)} 많습니다.</p>
          <p>서버가 저장 직전에 다시 계산합니다.</p>
        </div>
      ) : null}
      {message ? <p className="text-sm">{message}</p> : null}
      {form.formState.errors.winCount ? <p className="text-sm">{form.formState.errors.winCount.message}</p> : null}
      <button type="submit" disabled={form.formState.isSubmitting || stores.length === 0} className="min-h-12 w-full rounded-full bg-grass font-medium text-white disabled:opacity-50">
        {confirmation ? "초과를 확인하고 저장" : "기록 저장"}
      </button>
    </form>
  );
}
