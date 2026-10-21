import { redirect } from "next/navigation";
import { revokeMemberAction } from "@/app/actions";
import { loadMemberAdmin } from "@/server/data";

export default async function MembersPage() {
  const admin = await loadMemberAdmin();
  if (!admin.isOwner) {
    redirect("/settings");
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">멤버</h1>
      <p className="text-sm leading-6">
        활성 멤버는 방장을 포함해 세 명까지입니다. 새 멤버는 로그인 화면에서 닉네임과 비밀번호로 가입하고, 서버가 남은 캐릭터를 배정합니다.
      </p>
      <ul className="space-y-2">
        {admin.members.map((member) => (
          <li key={member.userId} className="flex items-center justify-between rounded-3xl bg-card px-4 py-3">
            <span>{member.nickname} · {member.role === "OWNER" ? "방장" : "멤버"} · {member.status}</span>
            {member.role !== "OWNER" && member.status === "ACTIVE" ? (
              <form action={revokeMemberAction}>
                <input type="hidden" name="userId" value={member.userId} />
                <button className="min-h-11 text-sm" type="submit">내보내기</button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
