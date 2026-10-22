import { NextResponse } from "next/server";
import { z } from "zod";
import { isAppError } from "@/domain/errors";
import { searchPublicStores } from "@/server/public-map";
import { assertRateLimit } from "@/server/rate-limit";
import { requireActor } from "@/server/session";

const querySchema = z.object({
  q: z.string().optional(),
  kind: z.enum(["CLAW", "ARCADE", "UNKNOWN"]).optional(),
  offset: z.coerce.number().int().min(0).max(45).optional(),
});

export async function GET(request: Request) {
  try {
    const actor = await requireActor();
    assertRateLimit(`map-search:${actor.id}`, 60, 60_000);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: "검색어를 확인해 주세요.", area: null, places: [], nearby: [], hasMore: false }, { status: 400 });
    }
    const result = await searchPublicStores({
      query: parsed.data.q ?? "",
      kind: parsed.data.kind ?? null,
      offset: parsed.data.offset ?? 0,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json(
        { status: "error", message: "검색 중 오류가 났습니다. 잠시 후 다시 시도해 주세요.", area: null, places: [], nearby: [], hasMore: false },
        { status: error.httpStatus },
      );
    }
    throw error;
  }
}
