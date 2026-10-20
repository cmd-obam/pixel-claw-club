import { StoreForm } from "@/components/store-form";

export default function NewStorePage() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">매장 등록</h1>
      <p className="text-sm leading-6 text-ink/70">좌표가 없으면 목록에만 남고 지도 마커는 생기지 않습니다. 같은 이름이라도 멀리 있으면 다른 매장으로 저장할 수 있습니다.</p>
      <StoreForm />
    </div>
  );
}
