import { z } from "zod";

export const storeInputSchema = z
  .object({
    name: z.string().trim().min(1, "매장 이름을 입력해 주세요.").max(80),
    address: z.string().trim().max(200),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    notes: z.string().trim().max(500),
    acknowledgeDuplicate: z.boolean(),
  })
  .refine((value) => (value.latitude === null) === (value.longitude === null), {
    message: "위도와 경도를 함께 입력해 주세요.",
  });

export const prizeDraftSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(40),
  description: z.string().trim().max(500),
  visibility: z.enum(["PRIVATE", "GROUP"]),
});

export const savePlaySchema = z
  .object({
    storeId: z.string().uuid(),
    visitId: z.string().uuid().nullable(),
    newVisit: z.boolean(),
    playedAt: z.string().min(1),
    attemptCount: z.number().int().min(1).max(999),
    winCount: z.number().int().min(0).max(999),
    amountSpent: z.number().int().min(0).max(10_000_000),
    machineLabel: z.string().trim().max(40),
    notes: z.string().trim().max(500),
    prizes: z.array(prizeDraftSchema).max(20),
    idempotencyKey: z.string().uuid(),
    confirmFingerprint: z.string().nullable(),
  })
  .refine((value) => value.winCount <= value.attemptCount, {
    message: "성공 횟수는 시도 횟수보다 클 수 없습니다.",
    path: ["winCount"],
  })
  .refine((value) => value.prizes.length <= value.winCount, {
    message: "등록하는 인형 수는 성공 횟수를 넘을 수 없습니다.",
    path: ["prizes"],
  });

export const privacySchema = z.object({
  showTotalSpending: z.enum(["PRIVATE", "GROUP"]),
  showWeeklySpending: z.enum(["PRIVATE", "GROUP"]),
  showStoreSpending: z.enum(["PRIVATE", "GROUP"]),
  showIndividualRecordAmounts: z.enum(["PRIVATE", "GROUP"]),
  showMonthlyStatistics: z.enum(["PRIVATE", "GROUP"]),
});

export type SavePlayValues = z.infer<typeof savePlaySchema>;
export type StoreInputValues = z.infer<typeof storeInputSchema>;
