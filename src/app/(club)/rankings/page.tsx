import Link from "next/link";
import { PERIOD_LABELS, type RankingPeriod } from "@/domain/rankings";
import { loadRankings } from "@/server/data";

const periods: RankingPeriod[] = ["week", "month", "all"];

export default async function RankingsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: RankingPeriod }>;
}) {
  const params = await searchParams;
  const period = periods.includes(params.period ?? "week") ? (params.period ?? "week") : "week";
  const board = await loadRankings(period);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">랭킹</h1>
      <div className="flex gap-2">
        {periods.map((item) => (
          <Link key={item} href={`/rankings?period=${item}`} className={`min-h-11 rounded-full px-3 py-2 text-sm ${item === period ? "bg-grass text-white" : "bg-card"}`}>
            {PERIOD_LABELS[item]}
          </Link>
        ))}
      </div>
      {board.categories.map((category) => (
        <section key={category.id} className="rounded-3xl bg-card p-4">
          <h2 className="font-bold">{category.title}</h2>
          {category.note ? <p className="mt-1 text-sm text-ink/70">{category.note}</p> : null}
          {!category.definitive && category.id === "value" ? (
            <p className="text-sm">공개된 멤버만 비교하므로 세 명의 최종 우승으로 보지 않습니다.</p>
          ) : null}
          <ol className="mt-2 space-y-1 text-sm">
            {category.rows.length === 0 ? <li>비교할 기록이 없습니다.</li> : null}
            {category.rows.map((row) => (
              <li key={row.memberId}>
                {row.rank}위 {row.nickname} · {row.valueLabel}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
