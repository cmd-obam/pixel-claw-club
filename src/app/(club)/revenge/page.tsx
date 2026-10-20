import { abandonRevengeAction, completeRevengeAction, createRevengeAction } from "@/app/actions";
import { loadHome, loadMemberAdmin, loadRecords, loadRevengeBoard } from "@/server/data";

export default async function RevengePage() {
  const [targets, home, members, records] = await Promise.all([
    loadRevengeBoard(),
    loadHome(),
    loadMemberAdmin(),
    loadRecords(),
  ]);
  const wins = records.filter((record) => record.winCount > 0 && !record.deleted);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">복수 목표</h1>
      <form action={createRevengeAction} className="space-y-2 rounded-3xl bg-card p-4">
        <select name="storeId" className="min-h-12 w-full rounded-2xl border border-cream-deep bg-white px-3" required>
          {home.stores.map((store) => (
            <option key={store.id} value={store.id}>{store.name}</option>
          ))}
        </select>
        <select name="assignedMemberId" className="min-h-12 w-full rounded-2xl border border-cream-deep bg-white px-3" required>
          {members.members.filter((member) => member.status === "ACTIVE").map((member) => (
            <option key={member.userId} value={member.userId}>{member.nickname}</option>
          ))}
        </select>
        <input name="reason" placeholder="다시 가고 싶은 이유" className="min-h-12 w-full rounded-2xl border border-cream-deep bg-white px-3" />
        <button className="min-h-12 w-full rounded-full bg-grass text-white" type="submit">복수 대기 만들기</button>
      </form>
      <ul className="space-y-3">
        {targets.length === 0 ? <li className="text-sm">진행 중인 목표가 없습니다.</li> : null}
        {targets.map((target) => (
          <li key={target.id} className="rounded-3xl bg-card p-4">
            <p className="font-medium">{target.storeName}</p>
            <p className="text-sm">{target.label} · {target.assignee}</p>
            {target.reason ? <p className="text-sm text-ink/70">{target.reason}</p> : null}
            {target.needsReview ? <p className="text-sm">연결된 성공 기록이 삭제되어 다시 확인이 필요합니다.</p> : null}
            {target.status === "ACTIVE" ? (
              <div className="mt-3 space-y-2">
                <form action={completeRevengeAction} className="flex gap-2">
                  <input type="hidden" name="targetId" value={target.id} />
                  <select name="recordId" className="min-h-12 flex-1 rounded-2xl border border-cream-deep bg-white px-2">
                    {wins.map((record) => (
                      <option key={record.id} value={record.id}>{record.storeName} · 성공 {record.winCount}</option>
                    ))}
                  </select>
                  <button className="min-h-12 rounded-full bg-grass px-3 text-sm text-white" type="submit">완료 확인</button>
                </form>
                <form action={abandonRevengeAction}>
                  <input type="hidden" name="targetId" value={target.id} />
                  <button className="min-h-11 text-sm" type="submit">오늘은 여기까지</button>
                </form>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
