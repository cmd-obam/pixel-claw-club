import { NextResponse } from "next/server";
import { searchPlaces } from "@/server/data";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const result = await searchPlaces(query);
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
