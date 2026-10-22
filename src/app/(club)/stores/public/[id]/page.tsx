import Link from "next/link";
import { notFound } from "next/navigation";
import { adoptPublicStoreAction } from "@/app/actions";
import { PUBLIC_STORE_CITATION } from "@/domain/public-stores";
import { loadPublicStore } from "@/server/public-map";

export default async function PublicStorePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const store = await loadPublicStore(id);
  if (!store) {
    notFound();
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{store.name}</h1>
      <p className="text-sm text-ink/70">{store.address || "주소 없음"}</p>
      <p className="text-sm">
        {store.regionName} · {store.businessStatus}
        {store.detailStatus ? ` · ${store.detailStatus}` : ""}
      </p>
      {store.latitude === null ? <p className="text-sm">좌표가 없어 지도 마커는 없습니다.</p> : null}
      {query.error === "1" ? <p className="text-sm text-[#ff5f8f]">이 매장을 기록용 매장으로 연결하지 못했습니다.</p> : null}
      <p className="text-sm leading-6 text-ink/70">{PUBLIC_STORE_CITATION.note}</p>
      <p className="text-xs leading-5 text-ink/60">
        출처: {PUBLIC_STORE_CITATION.provider} {PUBLIC_STORE_CITATION.dataset}
        {store.dataAsOf ? ` · 기준일 ${store.dataAsOf}` : ""}
      </p>
      <div className="grid gap-2">
        <form action={adoptPublicStoreAction}>
          <input type="hidden" name="publicStoreId" value={store.id} />
          <input type="hidden" name="next" value="record" />
          <button className="min-h-12 w-full rounded-full bg-[#ff7ea4] text-white" type="submit">
            이 매장으로 기록하기
          </button>
        </form>
        <form action={adoptPublicStoreAction}>
          <input type="hidden" name="publicStoreId" value={store.id} />
          <input type="hidden" name="next" value="revenge" />
          <button className="min-h-12 w-full rounded-full border border-[#ffb3c8] text-[#ff6f93]" type="submit">
            복수 리스트에 연결
          </button>
        </form>
        <Link href="/" className="grid min-h-11 place-items-center text-sm text-ink/70">
          지도로 돌아가기
        </Link>
      </div>
    </div>
  );
}
