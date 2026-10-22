import { NextResponse } from "next/server";
import { z } from "zod";
import { isAppError } from "@/domain/errors";
import { loadPublicMapLayer } from "@/server/public-map";
import { assertRateLimit } from "@/server/rate-limit";
import { requireActor } from "@/server/session";

const querySchema = z.object({
  south: z.coerce.number().min(-90).max(90).optional(),
  west: z.coerce.number().min(-180).max(180).optional(),
  north: z.coerce.number().min(-90).max(90).optional(),
  east: z.coerce.number().min(-180).max(180).optional(),
  zoom: z.coerce.number().min(1).max(21).optional(),
  q: z.string().optional(),
  kind: z.enum(["CLAW", "ARCADE", "UNKNOWN"]).optional(),
  nearLat: z.coerce.number().min(-90).max(90).optional(),
  nearLng: z.coerce.number().min(-180).max(180).optional(),
});

export async function GET(request: Request) {
  try {
    return await loadMapStores(request);
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json({ places: [] }, { status: error.httpStatus });
    }
    throw error;
  }
}

async function loadMapStores(request: Request) {
  const actor = await requireActor();
  assertRateLimit(`map-stores:${actor.id}`, 120, 60_000);
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ places: [] }, { status: 400 });
  }
  const query = parsed.data.q?.trim() ?? "";
  const south = parsed.data.south ?? 33;
  const north = parsed.data.north ?? 39;
  const west = parsed.data.west ?? 124;
  const east = parsed.data.east ?? 132;
  if (query.length < 2 && (south > north || west > east)) {
    return NextResponse.json({ places: [] }, { status: 400 });
  }
  const places = await loadPublicMapLayer({
    south,
    west,
    north,
    east,
    zoom: parsed.data.zoom ?? 14,
    query,
    kind: parsed.data.kind ?? null,
    nearLat: parsed.data.nearLat ?? null,
    nearLng: parsed.data.nearLng ?? null,
  });
  return NextResponse.json({ places }, { headers: { "Cache-Control": "private, no-store" } });
}
