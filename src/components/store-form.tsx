"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { storeInputSchema, type StoreInputValues } from "@/domain/forms";
import { createStoreAction } from "@/app/actions";

export function StoreForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<StoreInputValues>({
    resolver: zodResolver(storeInputSchema),
    defaultValues: {
      name: "",
      address: "",
      latitude: null,
      longitude: null,
      notes: "",
      acknowledgeDuplicate: false,
    },
  });

  return (
    <form
      className="space-y-3"
      onSubmit={form.handleSubmit(
        async (values) => {
          const result = await createStoreAction(values);
          setMessage(result.message);
          if (result.ok && result.id) {
            router.push(`/stores/${result.id}`);
            router.refresh();
          }
          if (!result.ok && result.message.includes("겹쳐")) {
            form.setValue("acknowledgeDuplicate", true);
          }
        },
        (errors) => {
          const first = Object.values(errors).find((error) => error?.message);
          setMessage(first?.message ?? "입력값을 확인해 주세요.");
        },
      )}
    >
      <input {...form.register("name")} placeholder="매장 이름" className="min-h-12 w-full rounded-2xl border border-cream-deep bg-white px-3" />
      <input {...form.register("address")} placeholder="주소" className="min-h-12 w-full rounded-2xl border border-cream-deep bg-white px-3" />
      <div className="grid grid-cols-2 gap-2">
        <input
          placeholder="위도"
          className="min-h-12 rounded-2xl border border-cream-deep bg-white px-3"
          onChange={(event) => form.setValue("latitude", event.target.value === "" ? null : Number(event.target.value))}
        />
        <input
          placeholder="경도"
          className="min-h-12 rounded-2xl border border-cream-deep bg-white px-3"
          onChange={(event) => form.setValue("longitude", event.target.value === "" ? null : Number(event.target.value))}
        />
      </div>
      <textarea {...form.register("notes")} placeholder="메모" className="min-h-24 w-full rounded-2xl border border-cream-deep bg-white px-3 py-2" />
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" {...form.register("acknowledgeDuplicate")} />
        가까운 매장이 있어도 다른 매장으로 저장
      </label>
      {message ? <p className="text-sm">{message}</p> : null}
      <button className="min-h-12 w-full rounded-full bg-grass text-white" type="submit">
        저장
      </button>
    </form>
  );
}
