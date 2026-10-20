import Link from "next/link";
import { createPrizeAction } from "@/app/actions";
import { loadPrizes } from "@/server/data";

export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const params = await searchParams;
  const prizes = await loadPrizes();
  const query = (params.q ?? "").trim();
  const category = params.category ?? "";
  const visible = prizes.filter((prize) => {
    const matchesQuery = query.length === 0 || prize.name.includes(query);
    const matchesCategory = category.length === 0 || prize.category === category;
    return matchesQuery && matchesCategory;
  });
  const categories = [...new Set(prizes.map((prize) => prize.category))];
  const designs = new Set(prizes.map((prize) => prize.designId)).size;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">인형 도감</h1>
      <p className="text-sm">보유 인형 {prizes.length}개 · 도감 종류 {designs}종</p>
      <form className="flex gap-2">
        <input name="q" defaultValue={query} placeholder="이름 검색" className="min-h-12 flex-1 rounded-full border border-cream-deep bg-white px-4" />
        <button className="min-h-12 rounded-full bg-ink px-4 text-white" type="submit">검색</button>
      </form>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/collection" className="rounded-full bg-card px-3 py-2">전체</Link>
        {categories.map((item) => (
          <Link key={item} href={`/collection?category=${encodeURIComponent(item)}`} className="rounded-full bg-card px-3 py-2">{item}</Link>
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-3">
        {visible.length === 0 ? <li className="col-span-2 text-sm">조건에 맞는 인형이 없습니다.</li> : null}
        {visible.map((prize) => (
          <li key={prize.id}>
            <Link href={`/collection/${prize.id}`} className="block min-h-28 rounded-3xl bg-card p-3">
              <span className="font-medium">{prize.name}</span>
              <span className="mt-1 block text-xs text-ink/70">{prize.ownerNickname} · {prize.visibility === "GROUP" ? "그룹 공개" : "비공개"}</span>
            </Link>
          </li>
        ))}
      </ul>
      <form action={createPrizeAction} className="space-y-2 rounded-3xl bg-lavender/40 p-4">
        <h2 className="font-bold">인형 등록</h2>
        <input name="name" required placeholder="이름" className="min-h-12 w-full rounded-2xl bg-white px-3" />
        <input name="category" defaultValue="기타" placeholder="분류" className="min-h-12 w-full rounded-2xl bg-white px-3" />
        <textarea name="description" placeholder="설명" className="min-h-20 w-full rounded-2xl bg-white px-3 py-2" />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="visibility" value="GROUP" />
          그룹에 공개하고 마을에 넣기
        </label>
        <button className="min-h-12 w-full rounded-full bg-grass text-white" type="submit">등록</button>
      </form>
    </div>
  );
}
