import { RecordForm } from "@/components/record-form";
import { utcToSeoulLocalInput } from "@/domain/time";
import { createRecordAction } from "@/app/actions";
import { loadHome } from "@/server/data";

export default async function NewRecordPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const home = await loadHome();
  const { store } = await searchParams;
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">플레이 기록</h1>
      <p className="text-sm leading-6 text-ink/70">기본값은 시도 1회, 성공 0회, 지금 시각입니다. 금액 0원도 입력값으로 저장됩니다. 저장하면 새 방문이 함께 만들어집니다.</p>
      {home.stores.length === 0 ? <p className="text-sm">먼저 매장을 등록해 주세요.</p> : null}
      <RecordForm stores={home.stores} playedAt={utcToSeoulLocalInput(new Date())} action={createRecordAction} initialStoreId={store} />
    </div>
  );
}
