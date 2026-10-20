import { createHash } from "node:crypto";

export type BudgetUsageState = "NORMAL" | "WARNING" | "REACHED" | "OVER";

export interface BudgetAssessment {
  spent: number;
  budget: number;
  remaining: number;
  excess: number;
  usagePercent: number | null;
  state: BudgetUsageState;
}

export interface BudgetProjection extends BudgetAssessment {
  spentBefore: number;
  amount: number;
  exceeded: boolean;
  fingerprint: string;
}

export const DEFAULT_WEEKLY_BUDGET_KRW = 10_000;
export const NOMINAL_GROUP_WEEKLY_BUDGET_KRW = 30_000;

export function assessBudget(spent: number, budget: number): BudgetAssessment {
  const remaining = budget - spent;
  const excess = Math.max(0, spent - budget);
  if (budget <= 0) {
    return {
      spent,
      budget,
      remaining,
      excess,
      usagePercent: null,
      state: spent > 0 ? "OVER" : "NORMAL",
    };
  }
  const usagePercent = (spent / budget) * 100;
  let state: BudgetUsageState = "NORMAL";
  if (spent > budget) {
    state = "OVER";
  } else if (spent === budget) {
    state = "REACHED";
  } else if (spent * 10 >= budget * 8) {
    state = "WARNING";
  }
  return { spent, budget, remaining, excess, usagePercent, state };
}

export function budgetFingerprint(parts: {
  memberId: string;
  weekStartIso: string;
  spentBefore: number;
  amount: number;
  budget: number;
  recordId: string | null;
}): string {
  const payload = [
    parts.memberId,
    parts.weekStartIso,
    parts.spentBefore,
    parts.amount,
    parts.budget,
    parts.recordId ?? "",
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

export function projectBudget(input: {
  memberId: string;
  weekStartIso: string;
  spentBefore: number;
  amount: number;
  budget: number;
  recordId?: string | null;
}): BudgetProjection {
  const projected = input.spentBefore + input.amount;
  const assessment = assessBudget(projected, input.budget);
  return {
    ...assessment,
    spentBefore: input.spentBefore,
    amount: input.amount,
    exceeded: projected > input.budget,
    fingerprint: budgetFingerprint({
      memberId: input.memberId,
      weekStartIso: input.weekStartIso,
      spentBefore: input.spentBefore,
      amount: input.amount,
      budget: input.budget,
      recordId: input.recordId ?? null,
    }),
  };
}

export function confirmationMatches(
  projection: BudgetProjection,
  fingerprint: string | null | undefined,
): boolean {
  if (!projection.exceeded) {
    return true;
  }
  return fingerprint === projection.fingerprint;
}
