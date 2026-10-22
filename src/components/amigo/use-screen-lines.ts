"use client";

import { privateFetch } from "@/lib/http/private-fetch";

import { useEffect, useState } from "react";
import type { ScreenKey } from "@/modules/ai-analysis/domain/ai-analysis.types";
import type { PeriodKey } from "@/modules/statistics/application/overview-service";

/**
 * As frases que ele escreveu para uma tela, lidas dos pacotes prontos (nunca
 * gera nada). Só o que veio do modelo: a reserva genérica não é fala dele.
 * `null` enquanto chega; quem usa decide qual frase o dado sustenta.
 */
export function useScreenLines(screen: ScreenKey, period?: PeriodKey): string[] | null {
  const [lines, setLines] = useState<string[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLines(null);
    const query = new URLSearchParams({ screen });
    if (period) query.set("period", period);
    privateFetch(`/api/ai/lines?${query}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { lines?: Array<{ screen: string; line: string }>; source?: string } | null) => {
        const written = payload?.source === "ai" ? (payload.lines ?? []) : [];
        setLines(written.filter((entry) => entry.screen === screen).map((entry) => entry.line));
      })
      .catch(() => {
        if (!controller.signal.aborted) setLines([]);
      });
    return () => controller.abort();
  }, [screen, period]);

  return lines;
}
