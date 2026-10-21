import Link from "next/link";
import { notFound } from "next/navigation";
import { formatKrw } from "@/domain/money";
import { formatMoneyCell } from "@/server/engine/queries";
import { loadStoreDetail } from "@/server/data";

export default async function StorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await loadStoreDetail(id);
  if (!detail) {
    notFound();
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{detail.store.name}</h1>
      <p className="text-sm text-ink/70">{detail.store.address || "주소 없음"}</p>
      {detail.store.latitude === null ? <p className="text-sm">좌표가 없어 지도에는 표시되지 않습니다.</p> : null}
      <p className="text-sm">{detail.spendingLabel}</p>
      {detail.records.length > 0 && "groupTotal" in detail && detail.groupTotal !== null ? (
        <p>공개 합계 {formatKrw(detail.groupTotal)}</p>
      ) : null}
      {detail.records.length > 0 && "permittedSpent" in detail && detail.groupTotal === null ? (
        <p className="text-sm">내게 공개된 금액만 {formatKrw(detail.permittedSpent)}입니다. 전체를 합산하지 않습니다.</p>
      ) : null}
      <ul className="space-y-2">
        {detail.records.length === 0 ? <li className="text-sm">이 매장의 플레이 기록이 없습니다.</li> : null}
        {detail.records.map((record) => (
          <li key={record.id}>
            <Link href={`/records/${record.id}`} className="block rounded-2xl bg-card px-3 py-3">
              {record.playerNickname} · 시도 {record.attemptCount} · 성공 {record.winCount} · {formatMoneyCell(record.amount)}
            </Link>
          </li>
        ))}
      </ul>
      <Link href={`/records/new?store=${detail.store.id}`} className="inline-flex min-h-12 items-center rounded-full bg-grass px-4 text-white">
        이 매장 기록하기
      </Link>
    </div>
  );
}
