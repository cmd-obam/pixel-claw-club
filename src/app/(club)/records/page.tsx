import Link from "next/link";
import { formatMoneyCell } from "@/server/engine/queries";
import { formatSeoul } from "@/domain/time";
import { loadRecords } from "@/server/data";

export default async function RecordsPage() {
  const records = await loadRecords();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">플레이 기록</h1>
        <Link href="/records/new" className="min-h-11 rounded-full bg-grass px-4 py-2 text-sm text-white">
          새 기록
        </Link>
      </div>
      {records.length === 0 ? <p className="text-sm">아직 기록이 없습니다. 방문과 시도는 따로 셉니다.</p> : null}
      <ul className="space-y-2">
        {records.map((record) => (
          <li key={record.id}>
            <Link href={`/records/${record.id}`} className="block rounded-3xl bg-card px-4 py-3">
              <span className="font-medium">{record.storeName}</span>
              <span className="mt-1 block text-sm text-ink/70">
                {record.playerNickname} · {formatSeoul(new Date(record.playedAt))} · 시도 {record.attemptCount} · 성공 {record.winCount} · {formatMoneyCell(record.amount)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
