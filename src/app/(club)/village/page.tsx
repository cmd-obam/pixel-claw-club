import { VillageCanvas } from "@/components/village-canvas";
import { loadVillage } from "@/server/data";
import { isProductionConfigured } from "@/server/config";

export default async function VillagePage() {
  const village = await loadVillage();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">살아 있는 마을</h1>
      <VillageCanvas village={village} />
      <p className="text-sm leading-6 text-ink/70">
        {isProductionConfigured()
          ? "실시간 구독은 이 화면에서 자동으로 연결되어 있지 않습니다. 페이지를 다시 열면 저장된 마을을 다시 읽습니다."
          : "데모에서는 실시간 동기화를 하지 않습니다. 새로고침하면 저장된 캐릭터를 다시 그립니다."}
      </p>
      <p className="rounded-3xl bg-butter px-4 py-3 text-sm">인형뽑기 기계 — 추후 업데이트</p>
    </div>
  );
}
