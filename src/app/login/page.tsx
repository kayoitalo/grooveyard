import { redirect } from "next/navigation";
import { authConfigured, currentSession } from "@/lib/security/session";
import { LoginForm } from "./login-form";
import { LoginStory } from "./login-story";
import styles from "./login.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entrar · Arcadium" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  if (await currentSession()) redirect("/overview");
  const expired = (await searchParams).expired === "1";
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.wordmark}>arcadium</p>
      </header>

      <div className={styles.layout}>
        <LoginStory />

        <section className={styles.entry} aria-labelledby="entry-title">
          <h2 id="entry-title" className={styles.entryTitle}>Bora continuar?</h2>
          {expired && <p role="status" className={styles.status}>Sua sessão terminou. Entra de novo pra continuar.</p>}
          {authConfigured() ? <LoginForm /> : (
            <p role="status" className={styles.status}>O proprietário ainda precisa configurar o acesso para abrir a sala.</p>
          )}
          <p className={styles.privateNote}>Tua sala de escuta. Acesso pessoal.</p>
        </section>
      </div>
    </main>
  );
}
