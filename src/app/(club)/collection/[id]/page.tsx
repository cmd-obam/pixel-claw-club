import { notFound } from "next/navigation";
import { deletePrizeAction, uploadPhotoAction, visibilityAction } from "@/app/actions";
import { loadPrize } from "@/server/data";
import { PhotoForm } from "@/components/photo-form";

export default async function PrizePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prize = await loadPrize(id);
  if (!prize) {
    notFound();
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{prize.name}</h1>
      <p className="text-sm">{prize.ownerNickname} · {prize.category} · {prize.visibility === "GROUP" ? "그룹 공개" : "나만 보기"}</p>
      {prize.description ? <p>{prize.description}</p> : null}
      {prize.storeName ? <p className="text-sm">획득 매장 {prize.storeName}</p> : null}
      {prize.unlinkNote ? <p className="text-sm">{prize.unlinkNote}</p> : null}
      {prize.pixelPath ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/assets/${prize.id}?kind=pixel`} alt={`${prize.name} 픽셀 변환`} className="w-full max-w-xs rounded-3xl" style={{ imageRendering: "pixelated" }} />
      ) : (
        <p className="rounded-3xl bg-cream-deep p-4 text-sm">픽셀 이미지가 없습니다. 아래 기본 안내만 표시되며, 이것은 인형 그림이 아닙니다.</p>
      )}
      {prize.processingError ? <p className="text-sm">{prize.processingError}</p> : null}
      <PhotoForm prizeId={prize.id} retry={Boolean(prize.originalPath)} action={uploadPhotoAction} />
      <form action={visibilityAction} className="flex gap-2">
        <input type="hidden" name="prizeId" value={prize.id} />
        <select name="visibility" defaultValue={prize.visibility} className="min-h-12 flex-1 rounded-2xl bg-white px-3">
          <option value="PRIVATE">나만 보기</option>
          <option value="GROUP">그룹 공개</option>
        </select>
        <button className="min-h-12 rounded-full bg-lavender px-4" type="submit">공개 변경</button>
      </form>
      <form action={deletePrizeAction}>
        <input type="hidden" name="prizeId" value={prize.id} />
        <button className="min-h-12 rounded-full bg-pink px-4" type="submit">인형 삭제</button>
      </form>
    </div>
  );
}
