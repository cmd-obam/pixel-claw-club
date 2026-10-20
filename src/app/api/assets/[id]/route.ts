import { NextResponse } from "next/server";
import { isProductionConfigured } from "@/server/config";
import { readDemoAsset } from "@/server/data";
import { createSupabaseServer } from "@/server/supabase/server";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const kind = new URL(request.url).searchParams.get("kind") === "original" ? "original" : "pixel";
  if (isProductionConfigured()) {
    const supabase = await createSupabaseServer();
    const { data: asset } = await supabase
      .from("prize_assets")
      .select("storage_path")
      .eq("prize_id", id)
      .eq("asset_type", kind)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const storagePath = asset && typeof asset.storage_path === "string" ? asset.storage_path : null;
    if (!storagePath) {
      return NextResponse.json({ message: "사진을 볼 수 없습니다." }, { status: 404 });
    }
    const signed = await supabase.storage.from("prize-assets").createSignedUrl(storagePath, 60);
    if (signed.error || !signed.data.signedUrl) {
      return NextResponse.json({ message: "사진 주소를 만들지 못했습니다." }, { status: 404 });
    }
    return NextResponse.redirect(signed.data.signedUrl);
  }
  const bytes = await readDemoAsset(id, kind);
  if (!bytes) {
    return NextResponse.json({ message: "사진을 볼 수 없습니다." }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": kind === "pixel" ? "image/png" : "application/octet-stream",
      "Cache-Control": "private, no-store",
    },
  });
}
