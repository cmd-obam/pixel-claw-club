import Link from "next/link";
import { signOutAction } from "@/app/actions";
import { PasswordChangeForm, SettingsForm, CharacterCardForm } from "@/components/settings-form";
import { loadSettings, loadShell } from "@/server/data";
import { loadCharacterCard } from "@/server/pin-login";

export default async function SettingsPage() {
  const [settings, shell, character] = await Promise.all([loadSettings(), loadShell(), loadCharacterCard()]);
  if (!shell) {
    return null;
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">마이</h1>
      <form action={signOutAction}>
        <button className="min-h-12 rounded-full bg-ink px-4 text-white" type="submit">로그아웃</button>
      </form>
      <CharacterCardForm
        slot={character.slot}
        name={character.name}
        prizeCount={character.prizeCount}
        choices={character.choices}
      />
      <SettingsForm
        initial={{
          nickname: settings.nickname,
          weeklyBudget: settings.weeklyBudget,
          privacy: {
            showTotalSpending: settings.privacy.showTotalSpending,
            showWeeklySpending: settings.privacy.showWeeklySpending,
            showStoreSpending: settings.privacy.showStoreSpending,
            showIndividualRecordAmounts: settings.privacy.showIndividualRecordAmounts,
            showMonthlyStatistics: settings.privacy.showMonthlyStatistics,
          },
        }}
      />
      <PasswordChangeForm />
      {shell.isOwner ? (
        <Link href="/settings/members" className="block rounded-3xl bg-lavender px-4 py-3">
          초대와 멤버 관리
        </Link>
      ) : (
        <p className="text-sm">멤버 초대는 방장만 할 수 있습니다.</p>
      )}
      <Link href="/budget" className="block text-sm text-grass">내 예산 보기</Link>
    </div>
  );
}
