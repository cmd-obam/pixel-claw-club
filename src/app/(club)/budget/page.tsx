import { formatKrw } from "@/domain/money";
import { loadBudget } from "@/server/data";

export default async function BudgetPage() {
  const budget = await loadBudget();
  const maxStore = Math.max(1, ...budget.storeBreakdown.map((item) => item.amount));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">내 지출</h1>
      <section className="rounded-3xl bg-card p-4">
        <p className="text-sm">이번 주</p>
        <p className="text-3xl font-bold">{formatKrw(budget.week.spent)}</p>
        <p className="text-sm">남은 예산 {formatKrw(budget.week.remaining)} · {budget.week.state}</p>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-cream-deep">
          <div className="h-full bg-pink" style={{ width: `${Math.min(100, budget.week.usagePercent ?? 0)}%` }} />
        </div>
      </section>
      <section className="grid grid-cols-2 gap-3">
        <article className="rounded-3xl bg-card p-4">
          <p className="text-sm">이번 달</p>
          <p className="text-xl font-bold">{formatKrw(budget.monthSpent)}</p>
        </article>
        <article className="rounded-3xl bg-card p-4">
          <p className="text-sm">전체</p>
          <p className="text-xl font-bold">{formatKrw(budget.lifetimeSpent)}</p>
        </article>
      </section>
      <section className="rounded-3xl bg-card p-4">
        <h2 className="font-bold">성공 1회당 평균</h2>
        <p className="mt-1">{budget.averageCostPerWin === null ? "기록된 성공이 없습니다." : formatKrw(Math.round(budget.averageCostPerWin))}</p>
      </section>
      <section className="rounded-3xl bg-card p-4">
        <h2 className="font-bold">매장별 내 지출</h2>
        {budget.storeBreakdown.length === 0 ? <p className="mt-2 text-sm">표시할 지출이 없습니다.</p> : null}
        <ul className="mt-3 space-y-2">
          {budget.storeBreakdown.map((item) => (
            <li key={item.storeId}>
              <div className="flex justify-between text-sm"><span>{item.storeName}</span><span>{formatKrw(item.amount)}</span></div>
              <div className="mt-1 h-2 rounded-full bg-cream-deep">
                <div className="h-full rounded-full bg-grass" style={{ width: `${(item.amount / maxStore) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-3xl bg-card p-4">
        <h2 className="font-bold">지출 내역</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {budget.history.length === 0 ? <li>내역이 없습니다.</li> : null}
          {budget.history.map((item) => (
            <li key={item.id}>{item.storeName} · {formatKrw(item.amount)}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
