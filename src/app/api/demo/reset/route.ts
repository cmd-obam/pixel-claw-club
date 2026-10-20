import { NextResponse } from "next/server";
import { isProductionConfigured } from "@/server/config";
import { resetDemoState } from "@/server/demo-store";

export async function POST() {
  if (isProductionConfigured()) {
    return NextResponse.json({ ok: false, message: "운영 모드에서는 데모 데이터를 지우지 않습니다." }, { status: 404 });
  }
  await resetDemoState();
  return NextResponse.json({ ok: true });
}
