import { DEMO_USERS } from "@/server/demo-accounts";
import { isProductionConfigured } from "@/server/config";
import { acceptAction, bootstrapAction, passwordAuthAction, signInDemoAction } from "@/app/actions";
import { AuthForms } from "@/components/auth-forms";

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const production = isProductionConfigured();
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-4 py-8">
      {error ? <p className="rounded-2xl bg-pink px-4 py-3 text-sm">{error}</p> : null}
      <h1 className="text-3xl font-bold">우리들의 뽑기 원정대</h1>
      {production ? (
        <AuthForms action={passwordAuthAction} />
      ) : (
        <div className="space-y-3">
          <p className="rounded-3xl bg-butter px-4 py-3 text-sm leading-6">
            Supabase가 설정되지 않았습니다. 아래는 이 기기의 데모 계정입니다. 실제 인증, 공유, 운영 데이터 저장이 아닙니다.
          </p>
          {DEMO_USERS.map((user) => (
            <form key={user.id} action={signInDemoAction}>
              <input type="hidden" name="userId" value={user.id} />
              <button className="min-h-12 w-full rounded-full bg-card px-4 text-left" type="submit">
                {user.nickname}로 데모 입장 {user.role === "OWNER" ? "· 방장" : ""}
              </button>
            </form>
          ))}
        </div>
      )}
      {production ? (
        <form action={bootstrapAction} className="space-y-2 rounded-3xl bg-card p-4">
          <p className="text-sm">아직 그룹이 없다면 방장으로 하나 만들 수 있습니다. 이후 가입은 자동으로 그룹에 넣지 않습니다.</p>
          <input name="name" defaultValue="PIXEL CLAW CLUB" className="min-h-12 w-full rounded-2xl border border-cream-deep px-3" />
          <button className="min-h-12 w-full rounded-full bg-lavender" type="submit">비공개 그룹 만들기</button>
        </form>
      ) : null}
      <form action={acceptAction} className="space-y-2">
        <input name="token" placeholder="초대 코드" className="min-h-12 w-full rounded-2xl border border-cream-deep bg-white px-3" />
        <button className="min-h-12 w-full rounded-full bg-grass text-white" type="submit">초대 수락</button>
      </form>
    </main>
  );
}
