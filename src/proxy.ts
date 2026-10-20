import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isProductionConfigured } from "@/server/config";
import { isDemoUserId, DEMO_COOKIE } from "@/server/demo-accounts";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = pathname.startsWith("/auth") || pathname.startsWith("/api/demo");
  if (isProductionConfigured()) {
    let response = NextResponse.next({ request });
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const cookie of cookiesToSet) {
              request.cookies.set(cookie.name, cookie.value);
            }
            response = NextResponse.next({ request });
            for (const cookie of cookiesToSet) {
              response.cookies.set(cookie.name, cookie.value, cookie.options);
            }
          },
        },
      },
    );
    const { data } = await supabase.auth.getUser();
    if (!data.user && !isPublic) {
      return NextResponse.redirect(new URL("/auth", request.url));
    }
    if (data.user && pathname.startsWith("/auth")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return response;
  }
  const demoUser = request.cookies.get(DEMO_COOKIE)?.value;
  const signedIn = Boolean(demoUser && isDemoUserId(demoUser));
  if (!signedIn && !isPublic) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }
  if (signedIn && pathname.startsWith("/auth")) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
