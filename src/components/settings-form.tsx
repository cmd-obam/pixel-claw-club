"use client";

import { useActionState, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { privacySchema } from "@/domain/forms";
import { changeCharacterAction, changePasswordAction, settingsAction } from "@/app/actions";
import { pixelFriends } from "@/components/pixel-friends";
import { PixelSprite } from "@/components/pixel-sprite";

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

const passwordInitial = { ok: true, message: "" };

export function PasswordChangeForm() {
  const [state, action, pending] = useActionState(changePasswordAction, passwordInitial);
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm font-bold">비밀번호 변경</p>
      <label className="block text-sm">
        현재 비밀번호
        <input name="currentPassword" type="password" autoComplete="current-password" required minLength={8} maxLength={64} className="mt-1 min-h-12 w-full rounded-2xl border border-cream-deep bg-white px-3" />
      </label>
      <label className="block text-sm">
        새 비밀번호
        <input name="nextPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={64} className="mt-1 min-h-12 w-full rounded-2xl border border-cream-deep bg-white px-3" />
      </label>
      <label className="block text-sm">
        새 비밀번호 확인
        <input name="nextPasswordConfirm" type="password" autoComplete="new-password" required minLength={8} maxLength={64} className="mt-1 min-h-12 w-full rounded-2xl border border-cream-deep bg-white px-3" />
      </label>
      {state.message ? <p className="text-sm">{state.message}</p> : null}
      <button className="min-h-12 w-full rounded-full bg-ink text-white disabled:opacity-60" type="submit" disabled={pending}>
        {pending ? "바꾸는 중" : "비밀번호 바꾸기"}
      </button>
    </form>
  );
}

export function CharacterCardForm({
  slot,
  name,
  prizeCount,
  choices,
}: {
  slot: number | null;
  name: string;
  prizeCount: number | null;
  choices: Array<{ slot: number; name: string }>;
}) {
  const [state, action, pending] = useActionState(changeCharacterAction, { ok: false, message: "" });
  const friend = pixelFriends.find((item) => item.slot === slot);
  return (
    <section className="space-y-3 rounded-3xl bg-white p-4">
      <h2 className="font-bold">내 캐릭터</h2>
      {friend ? <PixelSprite rows={friend.rows} label={friend.name} /> : null}
      <p className="text-sm">{name}</p>
      <p className="text-sm">획득 인형 {prizeCount === null ? "확인하지 못함" : `${prizeCount}개`}</p>
      <form action={action} className="space-y-2">
        <label className="block text-sm">
          사용 가능한 캐릭터
          <select name="slot" defaultValue={slot ?? ""} className="mt-1 min-h-12 w-full rounded-2xl border border-cream-deep bg-white px-3">
            {choices.map((choice) => (
              <option key={choice.slot} value={choice.slot}>{choice.name}</option>
            ))}
          </select>
        </label>
        {state.message ? <p className="text-sm">{state.message}</p> : null}
        {slot !== null && choices.length <= 1 ? (
          <p className="text-sm">남은 캐릭터가 없습니다. 다른 멤버와 바꾸려면 서로 동의한 교환이 필요합니다. 동의 없는 교환은 하지 않습니다.</p>
        ) : null}
        <button className="min-h-12 w-full rounded-full bg-ink text-white disabled:opacity-60" type="submit" disabled={pending || choices.length === 0}>
          {pending ? "바꾸는 중" : "캐릭터 바꾸기"}
        </button>
      </form>
    </section>
  );
}
