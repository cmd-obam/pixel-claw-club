import { cookies } from "next/headers";
import { isProductionConfigured } from "@/server/config";
import { isDemoUserId, DEMO_COOKIE } from "@/server/demo-accounts";
import { createSupabaseServer } from "@/server/supabase/server";

export { DEMO_COOKIE } from "@/server/demo-accounts";

export async function getActor(): Promise<{ id: string; mode: "demo" | "production" } | null> {
  if (isProductionConfigured()) {
    const supabase = await createSupabaseServer();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      return null;
    }
    return { id: data.user.id, mode: "production" };
  }
  const value = (await cookies()).get(DEMO_COOKIE)?.value;
  if (!value || !isDemoUserId(value)) {
    return null;
  }
  return { id: value, mode: "demo" };
}

export async function requireActor(): Promise<{ id: string; mode: "demo" | "production" }> {
  const actor = await getActor();
  if (!actor) {
    const { AppError } = await import("@/domain/errors");
    throw new AppError("AUTH", "로그인이 필요합니다.", 401);
  }
  return actor;
}
