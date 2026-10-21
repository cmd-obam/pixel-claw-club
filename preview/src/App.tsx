import { useMemo, useState } from "react";
import { PERIOD_LABELS } from "@/domain/rankings";
import { sampleBudget, sampleMoney, sampleRankings, sampleRecords, sampleStores, SAMPLE_NOTICE } from "./sample";
import { VillageScene } from "./VillageScene";

type Screen = "home" | "map" | "records" | "rankings" | "budget" | "village";

const links: Array<{ id: Screen; label: string }> = [
  { id: "map", label: "지도" },
  { id: "records", label: "기록" },
  { id: "rankings", label: "랭킹" },
  { id: "village", label: "마을" },
  { id: "budget", label: "예산" },
];

export function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [query, setQuery] = useState("");
  const stores = useMemo(
    () => sampleStores.filter((store) => query.trim().length === 0 || store.name.includes(query.trim()) || store.address.includes(query.trim())),
    [query],
  );
  const usage = Math.round((sampleBudget.spent / sampleBudget.budget) * 100);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col">
      <p className="bg-butter px-4 py-2 text-center text-sm text-ink">{SAMPLE_NOTICE}</p>
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <button className="min-h-11 text-left" type="button" onClick={() => setScreen("home")}>
          <span className="block text-xs font-medium tracking-wide text-grass">PIXEL CLAW CLUB</span>
          <span className="text-lg font-bold">우리들의 뽑기 원정대</span>
        </button>
        <span className="rounded-full bg-lavender px-3 py-2 text-sm">샘플 멤버 A</span>
      </header>
      <main className="flex-1 space-y-4 px-4 pb-28 md:pb-8">
        {screen === "home" ? (
          <>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setScreen("map");
              }}
            >
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="오락실 검색"
                className="min-h-12 flex-1 rounded-full border border-cream-deep bg-white px-4"
              />
              <button className="min-h-12 rounded-full bg-ink px-4 text-sm text-white" type="submit">
                검색
              </button>
            </form>
            <StoreList stores={stores} />
            <BudgetCard usage={usage} onOpen={() => setScreen("budget")} />
            <VillageScene />
            <section className="rounded-3xl bg-card p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">이번 주 랭킹</h2>
                <button className="text-sm text-grass" type="button" onClick={() => setScreen("rankings")}>
                  {PERIOD_LABELS.week}
                </button>
              </div>
              <RankingList limit={3} />
            </section>
            <p className="text-center text-xs text-ink/60">인형뽑기 기계 — 추후 업데이트</p>
          </>
        ) : null}
        {screen === "map" ? (
          <section className="space-y-3">
            <h1 className="text-2xl font-bold">오락실 지도</h1>
            <p className="text-sm leading-6 text-ink/70">미리보기에는 지도 타일이 없습니다. 샘플 매장만 목록으로 보여 줍니다.</p>
            <StoreList stores={stores} />
          </section>
        ) : null}
        {screen === "records" ? (
          <section className="space-y-3">
            <h1 className="text-2xl font-bold">플레이 기록</h1>
            <ul className="space-y-2">
              {sampleRecords.map((record) => (
                <li key={record.id} className="rounded-3xl bg-card px-4 py-3">
                  <span className="font-medium">{record.store}</span>
                  <span className="mt-1 block text-sm text-ink/70">
                    {record.player} · 시도 {record.attempts} · 성공 {record.wins} · {record.amount === null ? "비공개" : sampleMoney(record.amount)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="rounded-2xl bg-pink px-4 py-3 text-sm">이 화면의 저장 버튼은 없습니다. 기록은 샘플이며 서버에 전송되지 않습니다.</p>
          </section>
        ) : null}
        {screen === "rankings" ? (
          <section className="space-y-3">
            <h1 className="text-2xl font-bold">랭킹</h1>
            <p className="text-sm text-ink/70">샘플 집계를 원본 랭킹 계산으로 표시합니다. 실제 멤버 기록이 아닙니다.</p>
            <RankingList />
          </section>
        ) : null}
        {screen === "budget" ? (
          <section className="space-y-3">
            <h1 className="text-2xl font-bold">이번 주 예산</h1>
            <BudgetCard usage={usage} />
            <p className="text-sm text-ink/70">샘플 멤버 A의 이번 주 지출만 보여 줍니다. 다른 멤버의 비공개 금액은 숫자로 넣지 않았습니다.</p>
          </section>
        ) : null}
        {screen === "village" ? (
          <section className="space-y-3">
            <h1 className="text-2xl font-bold">살아 있는 마을</h1>
            <VillageScene />
          </section>
        ) : null}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-cream-deep bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] md:static md:border-0 md:bg-transparent md:px-4">
        <ul className="mx-auto grid max-w-5xl grid-cols-5">
          {links.map((link) => (
            <li key={link.id}>
              <button className="flex min-h-14 w-full items-center justify-center text-sm font-medium" type="button" onClick={() => setScreen(link.id)}>
                {link.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function StoreList({ stores }: { stores: typeof sampleStores }) {
  return (
    <section className="rounded-3xl bg-card p-4">
      <h2 className="text-lg font-bold">오락실 지도</h2>
      <p className="mt-1 text-sm text-ink/70">지도 공급자가 없습니다. 샘플 목록만 표시합니다.</p>
      <ul className="mt-3 space-y-2">
        {stores.length === 0 ? <li className="text-sm">찾는 샘플 매장이 없습니다.</li> : null}
        {stores.map((store) => (
          <li key={store.id} className="rounded-2xl bg-cream px-3 py-3 text-sm">
            <span className="font-medium">{store.name}</span>
            <span className="mt-1 block text-ink/70">{store.address}</span>
            <span className="mt-1 block text-ink/60">{store.marker}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BudgetCard({ usage, onOpen }: { usage: number; onOpen?: () => void }) {
  return (
    <section className="pixel-border rounded-3xl bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">이번 주 내 예산</h2>
        {onOpen ? (
          <button className="text-sm text-grass" type="button" onClick={onOpen}>
            자세히
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-bold">{sampleMoney(sampleBudget.spent)}</p>
      <p className="text-sm text-ink/70">
        예산 {sampleMoney(sampleBudget.budget)} · 남은 돈 {sampleMoney(sampleBudget.budget - sampleBudget.spent)} · {usage}%
      </p>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-cream-deep">
        <div className="h-full bg-grass" style={{ width: `${usage}%` }} />
      </div>
      <p className="mt-2 text-sm">샘플 예산 범위 안에서 표시 중입니다.</p>
    </section>
  );
}

function RankingList({ limit }: { limit?: number }) {
  const categories = limit ? sampleRankings.categories.slice(0, limit) : sampleRankings.categories;
  return (
    <ul className="mt-3 space-y-2 text-sm">
      {categories.map((category) => (
        <li key={category.id} className="rounded-2xl bg-cream px-3 py-2">
          <span className="font-medium">{category.title}</span>
          <span className="mt-1 block text-ink/70">
            {category.rows[0] ? `${category.rows[0].rank}위 ${category.rows[0].nickname} · ${category.rows[0].valueLabel}` : "비교할 샘플이 없습니다."}
            {category.note ? ` · ${category.note}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
