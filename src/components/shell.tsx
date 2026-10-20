import Link from "next/link";
import type { ShellInfo } from "@/server/data";

const links = [
  { href: "/map", label: "지도" },
  { href: "/records", label: "기록" },
  { href: "/rankings", label: "랭킹" },
  { href: "/village", label: "마을" },
  { href: "/settings", label: "마이" },
];

export function Shell({ info, children }: { info: ShellInfo; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col">
      {info.mode === "demo" ? (
        <p className="bg-butter px-4 py-2 text-center text-sm text-ink">
          데모 모드입니다. 이 브라우저의 연습 데이터이며, 실제 로그인이나 세 사람의 공유 저장이 아닙니다.
        </p>
      ) : null}
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="min-h-11">
          <span className="block text-xs font-medium tracking-wide text-grass">PIXEL CLAW CLUB</span>
          <span className="text-lg font-bold">우리들의 뽑기 원정대</span>
        </Link>
        <Link href="/settings" className="rounded-full bg-lavender px-3 py-2 text-sm">
          {info.nickname}
        </Link>
      </header>
      <main className="flex-1 px-4 pb-28 md:pb-8">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-cream-deep bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur md:static md:border-0 md:bg-transparent md:px-4">
        <ul className="mx-auto grid max-w-5xl grid-cols-5">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="flex min-h-14 items-center justify-center text-sm font-medium">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
