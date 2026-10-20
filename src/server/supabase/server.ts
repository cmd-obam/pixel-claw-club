import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { AppError } from "@/domain/errors";

export async function createSupabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new AppError("CONFIG", "Supabase 주소와 anon 키가 설정되지 않았습니다.");
  }
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const cookie of cookiesToSet) {
            cookieStore.set(cookie.name, cookie.value, cookie.options);
          }
        } catch {
          // Cookie writes from a Server Component are ignored. Proxy refreshes the session.
        }
      },
    },
  });
}

export function safeDatabaseMessage(message: string): string {
  if (message.includes("group is full")) {
    return "활성 멤버는 세 명까지입니다.";
  }
  if (message.includes("invitation expired")) {
    return "만료된 초대입니다.";
  }
  if (message.includes("already used") || message.includes("already a member")) {
    return "이미 사용되었거나 참여 중인 초대입니다.";
  }
  if (message.includes("invalid invitation") || message.includes("invitation revoked")) {
    return "초대가 유효하지 않습니다.";
  }
  if (message.includes("group already exists")) {
    return "이미 비공개 그룹이 있습니다.";
  }
  if (message.includes("duplicate submission")) {
    return "이미 처리된 요청과 내용이 다릅니다.";
  }
  if (message.includes("not authenticated")) {
    return "로그인이 필요합니다.";
  }
  return "요청을 처리하지 못했습니다. 입력값을 확인한 뒤 다시 시도해 주세요.";
}
