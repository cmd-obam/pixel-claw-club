"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { privacySchema } from "@/domain/forms";
import { settingsAction } from "@/app/actions";

const schema = z.object({
  nickname: z.string().trim().min(1, "닉네임을 입력해 주세요.").max(20),
  weeklyBudget: z.number().int().min(0),
  privacy: privacySchema,
});

type Values = z.infer<typeof schema>;

export function SettingsForm({ initial }: { initial: Values }) {
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial });
  const fields = [
    ["showWeeklySpending", "이번 주 지출"],
    ["showMonthlyStatistics", "이번 달 통계"],
    ["showTotalSpending", "전체 지출"],
    ["showStoreSpending", "매장별 지출"],
    ["showIndividualRecordAmounts", "기록별 금액"],
  ] as const;
  return (
    <form
      className="space-y-3"
      onSubmit={form.handleSubmit(async (values) => {
        const result = await settingsAction(values);
        setMessage(result.message);
      })}
    >
      <label className="block text-sm">
        닉네임
        <input {...form.register("nickname")} className="mt-1 min-h-12 w-full rounded-2xl border border-cream-deep bg-white px-3" />
      </label>
      <label className="block text-sm">
        주간 예산 (원)
        <input type="number" {...form.register("weeklyBudget", { valueAsNumber: true })} className="mt-1 min-h-12 w-full rounded-2xl border border-cream-deep bg-white px-3" />
      </label>
      {fields.map(([key, label]) => (
        <label key={key} className="block text-sm">
          {label}
          <select {...form.register(`privacy.${key}`)} className="mt-1 min-h-12 w-full rounded-2xl border border-cream-deep bg-white px-3">
            <option value="PRIVATE">나만 보기</option>
            <option value="GROUP">그룹 공개</option>
          </select>
        </label>
      ))}
      <p className="text-xs leading-5 text-ink/70">기본값은 모두 나만 보기입니다. 바꾸면 이후 응답부터 바로 적용됩니다.</p>
      {message ? <p className="text-sm">{message}</p> : null}
      <button className="min-h-12 w-full rounded-full bg-grass text-white" type="submit">저장</button>
    </form>
  );
}
