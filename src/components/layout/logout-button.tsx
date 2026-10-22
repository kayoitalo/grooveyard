"use client";

import { useState } from "react";
import styles from "./logout-button.module.css";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div className={styles.wrap}>
      <button type="button" disabled={busy} className={styles.button} onClick={async () => {
        setBusy(true);
        setError(false);
        try {
          const response = await fetch("/api/auth/logout", { method: "POST" });
          if (!response.ok) throw new Error();
          window.location.replace("/login");
        } catch { setError(true); setBusy(false); }
      }}>{busy ? "Saindo…" : "Sair"}</button>
      {error && <p role="alert" className={styles.error}>Falha ao sair. Tente de novo.</p>}
    </div>
  );
}
