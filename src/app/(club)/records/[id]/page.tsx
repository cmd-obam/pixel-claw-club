import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteRecordAction, restoreRecordAction } from "@/app/actions";
import { formatSeoul } from "@/domain/time";
import { formatMoneyCell } from "@/server/engine/queries";
import { loadRecord } from "@/server/data";

export default async function RecordDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await loadRecord(id);
  if (!record) {
    notFound();
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{record.storeName}</h1>
      <p>{formatSeoul(new Date(record.playedAt))}</p>
      <p>시도 {record.attemptCount} · 성공 {record.winCount}</p>
      <p>지출 {formatMoneyCell(record.amount)}</p>
      {record.machineLabel ? <p>기계 {record.machineLabel}</p> : null}
      {record.notes ? <p>{record.notes}</p> : null}
      {record.canEdit ? (
        <form action={deleteRecordAction.bind(null, record.id)}>
          <button className="min-h-12 rounded-full bg-pink px-4" type="submit">
            기록 삭제
          </button>
        </form>
      ) : (
        <p className="text-sm">다른 멤버의 기록은 수정할 수 없습니다.</p>
      )}
      {record.deleted ? (
        <form action={restoreRecordAction.bind(null, record.id)}>
          <button className="min-h-12 rounded-full bg-butter px-4" type="submit">
            기록 복구
          </button>
        </form>
      ) : null}
      <Link href="/records" className="inline-flex min-h-11 items-center text-sm text-grass">
        목록
      </Link>
    </div>
  );
}
