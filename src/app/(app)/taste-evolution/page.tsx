"use client";

import { privateFetch } from "@/lib/http/private-fetch";

import { useEffect, useState } from "react";
import { pickFresh } from "@/components/ai/pick-fresh";
import { Aviso } from "@/components/amigo/aviso";
import { Resposta } from "@/components/amigo/fala";
import { Janela } from "@/components/amigo/janela";
import { useScreenLines } from "@/components/amigo/use-screen-lines";
import { Mudou } from "@/components/mudou/mudou";
import { shiftHeadline, verifyShiftLine } from "@/modules/conversation/domain/shift-line";
import type { OverviewData, TasteShiftItem } from "@/modules/statistics/application/overview-service";

type Window = "30d" | "1y";

const WINDOWS: ReadonlyArray<{ key: Window; label: string }> = [
  { key: "30d", label: "os últimos 30 dias" },
  { key: "1y", label: "o último ano" },
];

const BEFORE: Record<Window, string> = { "30d": "os 30 dias anteriores", "1y": "o ano anterior" };
const IN_BEFORE: Record<Window, string> = { "30d": "nos 30 dias anteriores", "1y": "no ano anterior" };

type Shift = { rising: TasteShiftItem[]; declining: TasteShiftItem[] };

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; shift: Shift; /** Houve audição no período anterior? Sem ela não há o que comparar. */ before: boolean };

/**
 * O que mudou no gosto, janela contra janela anterior. Ele fala primeiro —
 * com a frase que o dado sustenta — e os gêneros que mais ganharam e
 * perderam espaço ficam ao lado, como prova.
 */
export default function OQueMudouPage() {
  const [period, setPeriod] = useState<Window>("30d");
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  /** O que ele diz: `undefined` enquanto decide, `null` quando não há o que dizer. */
  const [said, setSaid] = useState<{ headline: string; cited: string[] } | null | undefined>(undefined);
  const lines = useScreenLines("evolution", period);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    privateFetch(`/api/overview?period=${period}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`overview ${response.status}`);
        return response.json() as Promise<OverviewData>;
      })
      .then((data) =>
        setState({
          status: "ready",
          shift: data.tasteShift,
          before: data.summary.playsChangePercent !== null,
        }),
      )
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => controller.abort();
  }, [period, attempt]);

  // a frase dele: uma das que o modelo escreveu e o dado sustenta, sem repetir a última; senão, o maior salto
  useEffect(() => {
    if (state.status !== "ready" || lines === null) {
      setSaid(undefined);
      return;
    }
    const supported = lines.flatMap((line) => {
      const cited = verifyShiftLine(line, state.shift);
      return cited ? [{ headline: line, cited }] : [];
    });
    const picked = pickFresh(supported, `arcadium:frase:evolution:${period}`, (entry) => entry.headline);
    const fallback = shiftHeadline(state.shift);
    setSaid(picked ?? (fallback ? { headline: fallback.headline, cited: fallback.genres } : null));
  }, [lines, period, state]);

  const janela = (
    <Janela options={WINDOWS} value={period} onChange={setPeriod} before="comparando" after={`com ${BEFORE[period]}`} />
  );

  if (state.status === "error") {
    return (
      <Aviso headline="Me perdi comparando." narrative="Deu erro do meu lado juntando os dois períodos. Tenta de novo?">
        <Resposta onClick={() => setAttempt((current) => current + 1)}>tenta de novo</Resposta>
      </Aviso>
    );
  }

  if (state.status === "loading" || said === undefined) {
    return <Aviso window={janela} headline="Peraí, tô comparando." />;
  }

  const { shift, before } = state;

  if (!before) {
    return (
      <Aviso
        window={janela}
        headline={`Não tenho ${BEFORE[period]} pra comparar.`}
        narrative={`Não tem audição tua ${IN_BEFORE[period]}, então não dá pra dizer o que mudou${period === "1y" ? ". O mês dá." : "."}`}
      >
        {period === "1y" && <Resposta onClick={() => setPeriod("30d")}>compara o mês</Resposta>}
      </Aviso>
    );
  }

  if (!said) {
    return (
      <Aviso
        window={janela}
        headline="Ainda não achei uma mudança clara."
        narrative="As diferenças podem ser pequenas, ou pode faltar informação de gênero. Ainda não dá pra concluir que teu gosto ficou igual."
      ><Resposta href="/settings">ver informações dos artistas</Resposta></Aviso>
    );
  }

  return <Mudou shift={shift} headline={said.headline} cited={said.cited} window={janela} />;
}
