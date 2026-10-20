import Link from "next/link";
import { ArcadeMap } from "@/components/arcade-map";
import { loadHome } from "@/server/data";

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const home = await loadHome();
  const query = q.trim();
  const stores = home.stores.filter(
    (store) => query.length === 0 || store.name.includes(query) || store.address.includes(query),
  );
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">지도</h1>
        <Link href="/stores/new" className="min-h-11 rounded-full bg-grass px-4 py-2 text-sm text-white">
          매장 등록
        </Link>
      </div>
      <form className="flex gap-2">
        <input name="q" defaultValue={query} placeholder="저장된 매장 검색" className="min-h-12 flex-1 rounded-full border border-cream-deep bg-white px-4" />
        <button className="min-h-12 rounded-full bg-ink px-4 text-white" type="submit">검색</button>
      </form>
      <ArcadeMap stores={stores} map={home.shell.map} />
    </div>
  );
}
