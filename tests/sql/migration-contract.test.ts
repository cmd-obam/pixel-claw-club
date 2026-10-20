import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261020000001_init.sql"),
  "utf8",
);
const mutations = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261020000002_mutations.sql"),
  "utf8",
);

describe("migration contract", () => {
  it("locks financial rows, invitation hashes, capacity, and Seoul weeks", () => {
    expect(migration).toContain("REVOKE ALL ON public.financial_records");
    expect(migration).toContain("token_hash");
    expect(migration).not.toContain("token text");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("active_count > 3");
    expect(migration).toContain("Asia/Seoul");
    expect(migration).toContain("date_trunc('week'");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = public");
    expect(migration).toContain("풀밭 마을");
    expect(migration).toContain("(5, 50, NULL, '넓은 마을')");
    expect(mutations).toContain("confirm_fingerprint");
    expect(mutations).toContain("needs_review");
    expect(mutations).toContain("visibility = 'GROUP'");
  });
});
