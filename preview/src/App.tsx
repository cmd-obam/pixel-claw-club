import { useState } from "react";
import { PERIOD_LABELS } from "@/domain/rankings";
import { MapPreview } from "./MapPreview";
import { sampleBudget, sampleMoney, sampleRankings, sampleRecords, SAMPLE_NOTICE } from "./sample";
import { VillageScene } from "./VillageScene";

type Screen = "map" | "village" | "records" | "rankings" | "me";

const links: Array<{ id: Screen; label: string; icon: "map" | "village" | "record" | "rank" | "me" }> = [
  { id: "map", label: "지도", icon: "map" },
  { id: "village", label: "마을", icon: "village" },
  { id: "records", label: "기록", icon: "record" },
  { id: "rankings", label: "랭킹", icon: "rank" },
  { id: "me", label: "마이", icon: "me" },
];

export function App() {
  const [screen, setScreen] = useState<Screen>("map");
  const usage = Math.round((sampleBudget.spent / sampleBudget.budget) * 100);

  return (
    <div className="min-h-dvh bg-[#fff4ea]">
      <p className="bg-[#ffe7a3] px-4 py-2 text-center text-sm text-[#5c4a32]">{SAMPLE_NOTICE}</p>
      {screen === "map" ? <MapPreview /> : (
        <main className="mx-auto w-full max-w-[430px] space-y-4 px-4 py-4 pb-28">
          {screen === "records" ? (
            <section className="space-y-3">
              <h1 className="text-2xl font-bold">플레이 기록</h1>
              <p className="rounded-2xl bg-[#fff1f6] px-4 py-3 text-sm leading-6 text-[#8d6674]">샘플 목록입니다. 로그인과 기록 저장은 지원하지 않으며 서버로 전송되지 않습니다.</p>
              <ul className="space-y-2">
                {sampleRecords.map((record) => (
                  <li key={record.id} className="rounded-3xl bg-white px-4 py-3">
                    <span className="font-medium">{record.store}</span>
                    <span className="mt-1 block text-sm text-[#8d6674]">
                      {record.player} · 시도 {record.attempts} · 성공 {record.wins} · {record.amount === null ? "비공개" : sampleMoney(record.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {screen === "rankings" ? (
            <section className="space-y-3">
              <h1 className="text-2xl font-bold">랭킹</h1>
              <p className="text-sm text-[#8d6674]">샘플 집계를 표시합니다. {PERIOD_LABELS.week} 기준이며 실제 멤버 기록이 아닙니다.</p>
              <RankingList />
            </section>
          ) : null}
          {screen === "village" ? (
            <section className="space-y-3">
              <h1 className="text-2xl font-bold">살아 있는 마을</h1>
              <p className="text-sm text-[#8d6674]">샘플 인형으로 그린 미리보기입니다. 계정 사이에 동기화되지 않습니다.</p>
              <VillageScene />
            </section>
          ) : null}
          {screen === "me" ? (
            <section className="space-y-3">
              <h1 className="text-2xl font-bold">마이</h1>
              <p className="rounded-2xl bg-[#fff1f6] px-4 py-3 text-sm leading-6 text-[#8d6674]">정적 미리보기에는 로그인이 없습니다. 계정, 초대, 설정은 저장되지 않습니다.</p>
              <BudgetCard usage={usage} />
            </section>
          ) : null}
        </main>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#f3d5e2] bg-white px-2 pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto grid max-w-[430px] grid-cols-5">
          {links.map((link) => (
            <li key={link.id}>
              <button
                className={`flex min-h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium ${screen === link.id ? "text-[#ff5f8f]" : "text-[#b7b0b6]"}`}
                type="button"
                onClick={() => setScreen(link.id)}
              >
                <NavIcon name={link.icon} />
                {link.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function BudgetCard({ usage }: { usage: number }) {
  return (
    <section className="rounded-3xl bg-white p-4">
      <h2 className="text-lg font-bold">이번 주 내 예산</h2>
      <p className="mt-2 text-2xl font-bold">{sampleMoney(sampleBudget.spent)}</p>
      <p className="text-sm text-[#8d6674]">
        예산 {sampleMoney(sampleBudget.budget)} · 남은 돈 {sampleMoney(sampleBudget.budget - sampleBudget.spent)} · {usage}%
      </p>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#f6e7df]">
        <div className="h-full bg-[#7dbe7a]" style={{ width: `${usage}%` }} />
      </div>
      <p className="mt-2 text-sm">샘플 예산입니다. 저장되거나 다른 멤버와 공유되지 않습니다.</p>
    </section>
  );
}

function RankingList() {
  return (
    <ul className="mt-3 space-y-2 text-sm">
      {sampleRankings.categories.map((category) => (
        <li key={category.id} className="rounded-2xl bg-white px-3 py-2">
          <span className="font-medium">{category.title}</span>
          <span className="mt-1 block text-[#8d6674]">
            {category.rows[0] ? `${category.rows[0].rank}위 ${category.rows[0].nickname} · ${category.rows[0].valueLabel}` : "비교할 샘플이 없습니다."}
            {category.note ? ` · ${category.note}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

function NavIcon({ name }: { name: (typeof links)[number]["icon"] }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true as const };
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
