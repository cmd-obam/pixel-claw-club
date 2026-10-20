import { AppError } from "@/domain/errors";

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

export function assertRateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || now - current.updatedAt >= windowMs) {
    buckets.set(key, { tokens: limit - 1, updatedAt: now });
    return;
  }
  if (current.tokens <= 0) {
    throw new AppError("RATE_LIMIT", "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);
  }
  current.tokens -= 1;
}

export function resetRateLimits(): void {
  buckets.clear();
}
