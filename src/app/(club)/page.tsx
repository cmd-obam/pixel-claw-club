import Link from "next/link";
import { ArcadeMap } from "@/components/arcade-map";
import { VillageCanvas } from "@/components/village-canvas";
import { formatKrw } from "@/domain/money";
import { PERIOD_LABELS } from "@/domain/rankings";
import { loadHome } from "@/server/data";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const home = await loadHome();
  const query = q.trim();
  const stores = home.stores.filter(
    (store) =>
      query.length === 0 ||
      store.name.includes(query) ||
      store.address.includes(query),
  );
  const budget = home.budget;

  return (
    <div className="space-y-4">
      <form className="flex gap-2" action="/">
        <input
          name="q"
          defaultValue={query}
          placeholder="오락실 검색"
          className="min-h-12 flex-1 rounded-full border border-cream-deep bg-white px-4"
        />
        <button className="min-h-12 rounded-full bg-ink px-4 text-sm text-white" type="submit">
          검색
        </button>
      </form>
      <ArcadeMap stores={stores} map={home.shell.map} />
      <section className="pixel-border rounded-3xl bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">이번 주 내 예산</h2>
          <Link href="/budget" className="text-sm text-grass">
            자세히
          </Link>
        </div>
        <p className="mt-2 text-2xl font-bold">{formatKrw(budget.spent)}</p>
        <p className="text-sm text-ink/70">
          예산 {formatKrw(budget.budget)} · 남은 돈 {formatKrw(budget.remaining)}
          {budget.usagePercent !== null ? ` · ${budget.usagePercent.toFixed(0)}%` : ""}
        </p>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-cream-deep">
          <div
            className="h-full bg-grass"
            style={{ width: `${Math.min(100, budget.usagePercent ?? 0)}%` }}
          />
        </div>
        <p className="mt-2 text-sm">{budgetLabel(budget.state)}</p>
        <p className="mt-1 text-xs text-ink/70">{home.disclosedLabel}</p>
      </section>
      <VillageCanvas village={home.village} compact />
      <section className="rounded-3xl bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">이번 주 랭킹</h2>
          <Link href="/rankings" className="text-sm text-grass">
            {PERIOD_LABELS.week}
          </Link>
        </div>
        <ul className="mt-3 space-y-2 text-sm">
          {home.rankings.categories.slice(0, 3).map((category) => (
            <li key={category.id} className="rounded-2xl bg-cream px-3 py-2">
              <span className="font-medium">{category.title}</span>
              <span className="mt-1 block text-ink/70">
                {category.rows[0] ? `${category.rows[0].nickname} · ${category.rows[0].valueLabel}` : "아직 기록이 없습니다."}
                {category.note ? ` · ${category.note}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-3xl bg-card p-4">
        <h2 className="text-lg font-bold">복수 목표</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {home.revenge.length === 0 ? <li>아직 복수 목표가 없습니다.</li> : null}
          {home.revenge.map((item) => (
            <li key={item.id}>
              {item.title} · {item.assignee} · {item.status}
            </li>
          ))}
        </ul>
        <Link href="/revenge" className="mt-3 inline-flex min-h-11 items-center text-sm text-grass">
          복수 보드
        </Link>
      </section>
      <section className="rounded-3xl bg-card p-4">
        <h2 className="text-lg font-bold">최근 인형</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {home.prizes.length === 0 ? <li>공개되거나 내가 등록한 인형이 없습니다.</li> : null}
          {home.prizes.map((prize) => (
            <li key={prize.id}>
              <Link href={`/collection/${prize.id}`}>{prize.name}</Link>
              <span className="text-ink/70"> · {prize.owner}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-3xl bg-card p-4">
        <h2 className="text-lg font-bold">최근 활동</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {home.activity.length === 0 ? <li>아직 활동이 없습니다.</li> : null}
          {home.activity.map((item) => (
            <li key={item.id}>{item.text}</li>
          ))}
        </ul>
      </section>
      <p className="text-center text-xs text-ink/60">인형뽑기 기계 — 추후 업데이트</p>
    </div>
  );
}

function budgetLabel(state: string): string {
  if (state === "WARNING") return "예산의 80% 이상 사용했습니다.";
  if (state === "REACHED") return "이번 주 예산에 도달했습니다.";
  if (state === "OVER") return "예산을 넘겼습니다. 지출 기록은 막지 않으며, 넘는 금액은 확인 후 저장됩니다.";
  return "예산 범위 안에서 플레이 중입니다.";
}
