import { redirect } from "next/navigation";
import { inviteAction, revokeInviteAction, revokeMemberAction } from "@/app/actions";
import { loadMemberAdmin } from "@/server/data";
import { InviteButton } from "@/components/invite-button";

export default async function MembersPage() {
  const admin = await loadMemberAdmin();
  if (!admin.isOwner) {
    redirect("/settings");
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">멤버</h1>
      <p className="text-sm leading-6">활성 멤버는 방장을 포함해 세 명까지입니다. 초대 원문은 저장하지 않고, 만든 직후 한 번만 보여 줍니다.</p>
      <InviteButton action={inviteAction} />
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
      <ul className="space-y-2 text-sm">
        {admin.invitations.map((invitation) => (
          <li key={invitation.id} className="rounded-2xl bg-card px-3 py-2">
            만료 {invitation.expiresAt}
            {invitation.usedAt ? " · 사용됨" : ""}
            {invitation.revokedAt ? " · 취소됨" : ""}
            {!invitation.usedAt && !invitation.revokedAt ? (
              <form action={revokeInviteAction}>
                <input type="hidden" name="id" value={invitation.id} />
                <button type="submit">초대 취소</button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
