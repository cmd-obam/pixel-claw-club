import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { loadShell } from "@/server/data";

export default async function ClubLayout({ children }: { children: React.ReactNode }) {
  const info = await loadShell();
  if (!info) {
    redirect("/auth");
  }
  return <Shell info={info}>{children}</Shell>;
}
