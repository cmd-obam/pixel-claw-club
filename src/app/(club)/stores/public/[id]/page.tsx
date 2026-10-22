import Link from "next/link";
import { notFound } from "next/navigation";
import { adoptPublicStoreAction, confirmPublicStoreAction } from "@/app/actions";
import { PUBLIC_STORE_CITATION } from "@/domain/public-stores";
import { loadPublicStore } from "@/server/public-map";

export default async function PublicStorePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const store = await loadPublicStore(id);
  if (!store) {
    notFound();
  }
  const kindLabel = storeLabel(store.storeKind);
  const clawLabel = store.clawPresence === "YES" ? "있음" : store.clawPresence === "NO" ? "없음" : "미확인";
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{store.name}</h1>
      <p className="text-sm text-ink/70">{store.address || "주소 없음"}</p>
      <p className="text-sm">
        {kindLabel} · 인형뽑기 기계 {clawLabel}
      </p>
      <p className="text-sm text-ink/70">{store.classificationReason}</p>
      <p className="text-sm">
        {store.regionName} · {store.businessStatus}
        {store.detailStatus ? ` · ${store.detailStatus}` : ""}
        {store.verifiedAt ? ` · 회원 확인 ${store.verifiedAt.slice(0, 10)}` : ""}
      </p>
      {store.latitude === null ? <p className="text-sm">좌표가 없어 지도 마커는 없습니다.</p> : null}
      {query.error === "1" ? <p className="text-sm text-[#ff5f8f]">이 매장을 기록용 매장으로 연결하지 못했습니다.</p> : null}
      {query.saved === "1" ? <p className="text-sm text-[#ff6f93]">분류를 저장했습니다. 다른 회원 지도에도 반영됩니다.</p> : null}
      {query.saved === "0" || query.error === "2" ? <p className="text-sm text-[#ff5f8f]">분류를 저장하지 못했습니다.</p> : null}
      <form action={confirmPublicStoreAction} className="grid gap-2 rounded-3xl bg-white p-3">
        <label className="text-sm">
          매장 유형
          <select name="storeKind" defaultValue={store.storeKind} className="mt-1 min-h-12 w-full rounded-2xl border border-[#f3d5e2] bg-white px-3">
            <option value="CLAW">인형뽑기 전문점</option>
            <option value="ARCADE">일반 오락실</option>
            <option value="UNKNOWN">미확인</option>
          </select>
        </label>
        <label className="text-sm">
          인형뽑기 기계
          <select name="clawPresence" defaultValue={store.clawPresence} className="mt-1 min-h-12 w-full rounded-2xl border border-[#f3d5e2] bg-white px-3">
            <option value="YES">있음</option>
            <option value="NO">없음</option>
            <option value="UNKNOWN">미확인</option>
          </select>
        </label>
        <input type="hidden" name="publicStoreId" value={store.id} />
        <button className="min-h-12 rounded-full bg-[#9370DB] text-white" type="submit">분류 저장</button>
      </form>
      <p className="text-sm leading-6 text-ink/70">{PUBLIC_STORE_CITATION.note}</p>
      <p className="text-xs leading-5 text-ink/60">
        출처: {PUBLIC_STORE_CITATION.provider}{" "}
        {store.source.includes("general_game_providers") ? "문화_일반게임제공업" : "문화_청소년게임제공업"}
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

function storeLabel(kind: "CLAW" | "ARCADE" | "UNKNOWN"): string {
  if (kind === "CLAW") return "인형뽑기 전문점";
  if (kind === "ARCADE") return "일반 오락실";
  return "유형 미확인";
}
