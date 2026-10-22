import { AppShell } from "@/components/layout/app-shell";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/security/session";
import { SelectionProvider } from "@/components/descobertas/selection-provider";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/login");
  return <SelectionProvider key={session.userId} userId={session.userId}><AppShell>{children}</AppShell></SelectionProvider>;
}
