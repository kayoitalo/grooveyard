"use client";

import { useState, type FormEvent } from "react";
import styles from "./login.module.css";

export function LoginForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [invalidPassword, setInvalidPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    setBusy(true);
    setError(null);
    setInvalidPassword(false);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setInvalidPassword(response.status === 401);
        const data = await response.json();
        throw new Error(data.error || "Não foi possível entrar.");
      }
      window.location.replace("/overview");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível entrar.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={styles.form} aria-busy={busy}>
      <div>
        <label htmlFor="password" className={styles.label}>tua senha</label>
        <div className={styles.passwordField}>
        <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={256} placeholder="Digite sua senha"
          aria-describedby={error ? "login-error" : undefined} disabled={busy}
          aria-invalid={invalidPassword || undefined}
          className={styles.input} />
        <button type="button" className={styles.reveal} disabled={busy} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword} aria-controls="password" onClick={() => setShowPassword((shown) => !shown)}>{showPassword ? "ocultar" : "mostrar"}</button>
        </div>
      </div>
      {error && <p id="login-error" role="alert" className={styles.error}>{error}</p>}
      <button type="submit" disabled={busy} className={styles.submit}>
        <span>{busy ? "Abrindo tua sala…" : "entrar na conversa"}</span>
        <span className={styles.submitArrow} aria-hidden="true">{busy ? "···" : "↗"}</span>
      </button>
    </form>
  );
}
