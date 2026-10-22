"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ShellInfo } from "@/server/data";
import { BottomNav } from "@/components/bottom-nav";

export function Shell({ info, children }: { info: ShellInfo; children: React.ReactNode }) {
  const pathname = usePathname();
  const mapScreen = pathname === "/" || pathname.startsWith("/map");
  return (
    <div className={`mx-auto flex w-full max-w-5xl flex-col ${mapScreen ? "h-dvh overflow-hidden" : "min-h-dvh"}`}>
      {info.mode === "demo" ? (
        <p className="bg-butter px-4 py-2 text-center text-sm text-ink">
          데모 모드입니다. 이 브라우저의 연습 데이터이며, 실제 로그인이나 세 사람의 공유 저장이 아닙니다.
        </p>
      ) : null}
      {mapScreen ? null : (
        <header className="flex items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="min-h-11">
            <span className="block text-xs font-medium tracking-wide text-grass">PIXEL CLAW CLUB</span>
            <span className="text-lg font-bold">우리들의 뽑기 원정대</span>
          </Link>
          <Link href="/settings" className="rounded-full bg-lavender px-3 py-2 text-sm">
            {info.nickname}
          </Link>
        </header>
      )}
      <main className={mapScreen ? "flex min-h-0 flex-1 flex-col" : "flex-1 px-4 pb-28"}>{children}</main>
      <BottomNav docked={mapScreen} />
    </div>
  );
}
