"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "지도", icon: "map" },
  { href: "/village", label: "마을", icon: "village" },
  { href: "/records", label: "기록", icon: "record" },
  { href: "/rankings", label: "랭킹", icon: "rank" },
  { href: "/settings", label: "마이", icon: "me" },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#f3d5e2] bg-white px-2 pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-[430px] grid-cols-5">
        {links.map((link) => {
          const active = link.href === "/" ? pathname === "/" || pathname.startsWith("/map") : pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <li key={link.href}>
              <Link href={link.href} className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${active ? "text-[#ff5f8f]" : "text-[#b7b0b6]"}`}>
                <NavIcon name={link.icon} />
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function NavIcon({ name }: { name: (typeof links)[number]["icon"] }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true };
  if (name === "map") {
    return (
      <svg {...common}>
        <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" />
        <circle cx="12" cy="11" r="2" />
      </svg>
    );
  }
  if (name === "village") {
    return (
      <svg {...common}>
        <path d="M4 11 12 4l8 7" />
        <path d="M7 10.5V20h10v-9.5" />
      </svg>
    );
  }
  if (name === "record") {
    return (
      <svg {...common}>
        <rect x="6" y="3" width="12" height="18" rx="2" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </svg>
    );
  }
  if (name === "rank") {
    return (
      <svg {...common}>
        <path d="M7 4h10v3a5 5 0 0 1-10 0V4Z" />
        <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 12v3M9 20h6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="8" r="3" />
      <path d="M6 19c1.4-3 3.4-4.5 6-4.5S16.6 16 18 19" />
    </svg>
  );
}
