import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/domain/errors";

export function createSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new AppError("CONFIG", "서버 인증 설정이 완료되지 않았습니다.");
  }
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
