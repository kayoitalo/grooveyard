"use client";

import { privateFetch } from "@/lib/http/private-fetch";

import { useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Aviso } from "@/components/amigo/aviso";
import { Capa, Fala, PenLayer, Resposta, Respostas } from "@/components/amigo/fala";
import { band, type Point } from "@/components/amigo/gestures";
import { boxOf, textLines } from "@/components/amigo/measure";
import type { TraceGesture, WaveSpec } from "@/components/amigo/trace";
import { usePen, type PenDrawing } from "@/components/amigo/use-pen";
import { usePulse } from "@/components/amigo/use-pulse";
import { useSound } from "@/components/amigo/use-sound";
import { genreLabel } from "@/lib/format/genre";
import { Mapa, type MapDot } from "./mapa";
import { useSelection } from "./selection-provider";
import { MAX_SELECTED_TRACKS, selectionKey } from "./selection";
import styles from "./descobertas.module.css";

interface Candidate {
  id: string;
  artistName: string;
  trackName: string;
  albumName: string | null;
  coverUrl?: string | null;
  previewUrl?: string | null;
  appleMusicUrl?: string | null;
  genre: string | null;
  reason: string | null;
  position: { proximity: number; fame: number } | null;
}

type Action = "liked" | "saved" | "known" | "skipped";

interface ExportResult {
  playlistTitle?: string;
  playlistUrl?: string;
  mode?: string;
  resolvedCount?: number;
  totalItems?: number;
  m3uPayload?: string;
  error?: string;
}

const FEEDBACK_API: Record<Action, string> = {
  liked: "LIKED",
  saved: "SAVE_FOR_LATER",
  known: "ALREADY_KNOW",
  skipped: "NOT_INTERESTED",
};

const HOW: Record<Action, string> = { liked: "curtiu", saved: "guardou", known: "já conhecia", skipped: "pulou" };

/** Os cantos do mapa que valem a visita, ditos como ele diria. */
const CORNERS = [
  { label: "quase em casa", proximity: 88, fame: 70 },
  { label: "um passo ao lado", proximity: 55, fame: 50 },
  { label: "fora da bolha", proximity: 18, fame: 30 },
  { label: "como nunca ouvi isso?", proximity: 62, fame: 92 },
];

/** A moldura em volta da capa, com folga: é por ela que a corda passa. */
function frame(box: { left: number; top: number; width: number; height: number }, gap: number): Point[] {
  const [left, top] = [box.left - gap, box.top - gap];
  const [right, bottom] = [box.left + box.width + gap, box.top + box.height + gap];
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
    { x: left, y: top },
  ];
}

/**
 * Pra ouvir depois. Ele indica uma faixa por vez, dizendo de onde tirou
 * a ideia; você ouve ali mesmo e responde. Tocando, a corda dele abraça a
 * capa e vibra com o som. Embaixo, o mapa que decide onde ele procura, e
 * o que você separou para levar.
 */
export function Descobertas() {
  const reduced = Boolean(useReducedMotion());
  const [proximity, setProximity] = useState(55);
  const [fame, setFame] = useState(50);
  const [queue, setQueue] = useState<Candidate[] | null>(null);
  const [index, setIndex] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const [decided, setDecided] = useState<Record<string, Action>>({});
  const [exported, setExported] = useState<"running" | ExportResult | null>(null);
  const [exportHidden, setExportHidden] = useState(false);
  const modalOpen = Boolean(exported) && !exportHidden;
  const [saving, setSaving] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const exportRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const selection = useSelection();
  const kept = selection.items;
  const requestRef = useRef(0);

  const stageRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const sound = useSound();
  const { stop, toggle } = sound;
  const signal = usePulse(stageRef, sound.playing, sound.read);

  const load = useCallback(async (nextProximity: number, nextFame: number) => {
    if (savingRef.current) return;
    const token = ++requestRef.current;
    setBusy(true);
    setFailed(false);
    setFeedbackError(null);
    try {
      const response = await privateFetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "BALANCED", context: "GENERAL", proximity: nextProximity, fame: nextFame }),
      });
      if (!response.ok) throw new Error(`recommendations ${response.status}`);
      const payload = (await response.json()) as { items?: Candidate[]; sessionId?: string };
      // uma resposta antiga não pode sobrescrever a busca atual
      if (token !== requestRef.current) return;
      setQueue(payload.items ?? []);
      setSessionId(payload.sessionId ?? null);
      setIndex(0);
      setDecided({});
    } catch {
      if (token === requestRef.current) setFailed(true);
    } finally {
      if (token === requestRef.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(55, 50);
  }, [load]);

  const move = useCallback((nextProximity: number, nextFame: number) => {
    setProximity(nextProximity);
    setFame(nextFame);
  }, []);

  const commit = useCallback(
    (nextProximity: number, nextFame: number) => {
      if (savingRef.current) return;
      move(nextProximity, nextFame);
      void load(nextProximity, nextFame);
    },
    [load, move],
  );

  const current = queue?.[index] ?? null;
  const finished = queue !== null && queue.length > 0 && index >= queue.length;

  // outra faixa na frente: a anterior para de tocar
  useEffect(() => {
    stop();
  }, [current?.id, stop]);

  const decide = useCallback(
    async (action: Action) => {
      if (!current || busy || savingRef.current || !selection.ready) return;
      if ((action === "liked" || action === "saved") && selection.items.length >= MAX_SELECTED_TRACKS && !selection.items.some((item) => selectionKey(item) === selectionKey(current))) {
        setFeedbackError("A lista está com 200 faixas. Leva pro Spotify ou remove uma antes de guardar mais.");
        return;
      }
      savingRef.current = true;
      setSaving(true);
      setFeedbackError(null);
      stop();
      try {
        if (!sessionId) throw new Error("Não consegui identificar a busca. Tenta buscar de novo.");
        const response = await privateFetch(`/api/recommendations/${sessionId}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: current.id, type: FEEDBACK_API[action] }),
        });
        if (!response.ok) throw new Error("Não consegui guardar tua resposta. Tenta de novo; a faixa continua aqui.");
        if (action === "liked" || action === "saved") selection.add({ id: current.id, trackName: current.trackName, artistName: current.artistName, action });
        setDecided((previous) => ({ ...previous, [current.id]: action }));
        setIndex((value) => value + 1);
      } catch (cause) {
        setFeedbackError(cause instanceof Error ? cause.message : "A conexão falhou. Tenta responder de novo.");
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [current, sessionId, stop, busy, selection.add, selection.ready, selection.items],
  );

  const toggleSound = useCallback(() => {
    if (current?.previewUrl) toggle(current.previewUrl);
  }, [current, toggle]);

  useEffect(() => {
    if (!current || modalOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [role='group']")) return;
      // num botão ou link com foco, espaço e Enter são dele
      if ((event.key === " " || event.key === "Enter") && target?.closest("button, a")) return;
      const key = event.key.toLowerCase();
      if (key === " ") {
        event.preventDefault();
        toggleSound();
      } else if (key === "arrowup") {
        event.preventDefault();
        decide("liked");
      } else if (key === "arrowdown") {
        event.preventDefault();
        decide("saved");
      } else if (key === "arrowright") {
        event.preventDefault();
        decide("skipped");
      } else if (key === "k") decide("known");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, decide, modalOpen, toggleSound]);

  /** As sugestões desta busca, nos mesmos eixos que você regulou. */
  const dots = useMemo<MapDot[]>(
    () =>
      (queue ?? [])
        .filter((item) => item.position)
        .map((item) => ({
          id: item.id,
          proximity: item.position!.proximity,
          fame: item.position!.fame,
          done: Boolean(decided[item.id]),
          current: item.id === current?.id,
        })),
    [queue, decided, current?.id],
  );

  const exportKept = async () => {
    if (exportRef.current || kept.length === 0) return;
    exportRef.current = true;
    setExportHidden(false);
    setExported("running");
    try {
      const response = await privateFetch("/api/spotify/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracks: kept.map((item) => ({ trackName: item.trackName, artistName: item.artistName })) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "A exportação falhou.");
      setExported(payload.data as ExportResult);
    } catch (cause) {
      setExported({ error: cause instanceof Error ? cause.message : "A exportação falhou." });
    } finally {
      exportRef.current = false;
    }
  };

  const downloadM3u = (result: ExportResult) => {
    const blob = new Blob([result.m3uPayload ?? ""], { type: "audio/x-mpegurl" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${result.playlistTitle ?? "arcadium"}.m3u`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const header = document.getElementById("arcadium-header");
    const headerWasInert = header?.inert;
    if (header) header.inert = true;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setExportHidden(true); }
      if (event.key !== "Tab") return;
      const elements = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]');
      if (!elements?.length) { event.preventDefault(); dialogRef.current?.focus(); return; }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (header) header.inert = headerWasInert ?? false;
      document.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [modalOpen]);

  // ---------- onde o traço vai ----------

  const showing = Boolean(current && !busy);
  const headline = current ? `Escuta essa: ${current.trackName}, de ${current.artistName}.` : "";

  const draw = (origin: DOMRect): PenDrawing | null => {
    if (!showing) return null;
    const gestures: TraceGesture[] = [];
    let wave: WaveSpec | null = null;
    const mark = markRef.current;
    if (mark) {
      const { lines, size } = textLines(mark, origin);
      if (lines.length > 0) {
        const { strokes, width } = band(lines, size);
        gestures.push({ id: `grifo:${current?.id}`, layer: "under", strokes, width, cap: "butt" });
      }
    }
    const cover = coverRef.current;
    if (cover && sound.playing) {
      const box = boxOf(cover, origin);
      // tocando, a corda abraça a capa e só incha para fora: nunca cobre a arte
      wave = {
        base: frame(box, 12),
        amp: Math.min(22, box.width * 0.06),
        outwardFrom: { x: box.left + box.width / 2, y: box.top + box.height / 2 },
        width: Math.max(1.5, Math.min(2.5, origin.width / 600)),
      };
    }
    return { gestures, wave, notes: [] };
  };

  const pen = usePen(stageRef, draw, `${showing ? current?.id : "-"}|${sound.playing ? "som" : ""}`);

  // ---------- o que aparece em cima ----------

  let top: React.ReactNode;
  if (!queue && failed) {
    top = (
      <Aviso headline="Me perdi procurando." narrative="Deu erro do meu lado montando as sugestões. Tenta de novo?">
        <Resposta onClick={() => void load(proximity, fame)}>tenta de novo</Resposta>
      </Aviso>
    );
  } else if (!queue || busy) {
    top = <Aviso window="pra ouvir depois" headline="Peraí, tô procurando nesse canto do mapa." />;
  } else if (failed) {
    top = (
      <Aviso headline="Me perdi procurando." narrative="Deu erro do meu lado nesse canto do mapa. Tenta de novo?">
        <Resposta onClick={() => void load(proximity, fame)}>tenta de novo</Resposta>
      </Aviso>
    );
  } else if (queue.length === 0) {
    top = (
      <Aviso
        window="pra ouvir depois"
        headline="Nada novo nesse canto."
        narrative="Mexe no mapa: mais pra esquerda ou mais pra baixo mora o que você ainda não ouviu."
      />
    );
  } else if (finished || !current) {
    top = (
      <Aviso
        window="pra ouvir depois"
        headline={kept.length > 0 ? `Você separou ${kept.length}.` : "Nenhuma passou no teste."}
        narrative={
          kept.length > 0
            ? "Leva pro Spotify agora, ou mexe no mapa que eu busco mais."
            : "Mexe no mapa que eu procuro em outro canto."
        }
      >
        {kept.length > 0 && <Resposta onClick={() => void exportKept()}>levar {kept.length} pro Spotify</Resposta>}
        <Resposta onClick={() => void load(proximity, fame)}>busca mais</Resposta>
      </Aviso>
    );
  } else {
    top = (
      <div>
        <section className={styles.block} aria-label="A sugestão da vez">
          <Fala
            level={1}
            window={`pra ouvir depois · ${index + 1} de ${queue.length}`}
            headline={headline}
            narrative={current.reason}
            markRef={markRef}
            marked={pen.started.has(`grifo:${current.id}`)}
            mark={[current.trackName]}
          />
          <div className={styles.record}>
            <Capa
              cover={{ url: current.coverUrl, title: current.albumName ?? current.trackName, artist: current.artistName }}
              playing={sound.playing}
              innerRef={coverRef}
              className={styles.cover}
              eager
            />
            <div className={styles.caption}>
              <a className={styles.mapLink} href="#mapa-descoberta">ajustar o mapa · {kept.length} separadas ↓</a>
              {current.albumName && <span className={styles.album}>{current.albumName}</span>}
              <span className={styles.meta}>
                {[current.genre && genreLabel(current.genre), current.previewUrl ? "prévia de 30s" : "sem prévia"]
                  .filter(Boolean)
                  .join(" · ")}
                {current.appleMusicUrl && (
                  <>
                    {current.genre || !current.previewUrl ? " · " : ""}
                    <a href={current.appleMusicUrl} target="_blank" rel="noreferrer">
                      prévia do Apple Music ↗
                    </a>
                  </>
                )}
              </span>
            </div>
          </div>
        </section>
        <Respostas>
          <p className={styles.feedback} role={feedbackError || sound.error ? "alert" : "status"}>
            {feedbackError || sound.error || (saving ? "Guardando tua resposta…" : "O que você separar fica na lista, mesmo se mudar o mapa.")}
          </p>
          <Resposta onClick={toggleSound} disabled={!current.previewUrl} pressed={sound.playing} hint="espaço">
            {sound.loading ? "carregando prévia…" : sound.playing ? "para aí" : "toca aí"}
          </Resposta>
          <Resposta onClick={() => void decide("liked")} hint="↑" disabled={saving || !selection.ready} primary>
            curti
          </Resposta>
          <Resposta onClick={() => void decide("saved")} hint="↓" disabled={saving || !selection.ready}>
            guardo pra depois
          </Resposta>
          <Resposta onClick={() => void decide("known")} hint="K" disabled={saving}>
            já conheço
          </Resposta>
          <Resposta onClick={() => void decide("skipped")} hint="→" disabled={saving}>
            pula
          </Resposta>
        </Respostas>
      </div>
    );
  }

  const result = exported && exported !== "running" ? exported : null;

  return (
    <div ref={stageRef} className={styles.stage}>
      <div inert={modalOpen}>
      {top}

      <section id="mapa-descoberta" className={styles.map} aria-label="Onde ele procura">
        <div>
          <h2 className={styles.mapTitle}>o mapa</h2>
          <p className={styles.mapNote}>
            Pra direita, mais perto do que você já ouve; pra cima, mais gente conhece. Arrasta a mira que eu procuro
            nesse canto.
          </p>
          <Mapa proximity={proximity} fame={fame} dots={dots} busy={busy || saving} onChange={move} onCommit={commit} />
          <ul className={styles.corners} aria-label="Cantos do mapa">
            {CORNERS.map((corner) => (
              <li key={corner.label}>
                <button
                  type="button"
                  disabled={busy || saving}
                  aria-pressed={corner.proximity === proximity && corner.fame === fame}
                  onClick={() => commit(corner.proximity, corner.fame)}
                >
                  {corner.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className={styles.mapTitle}>separadas</h2>
          {exported && exportHidden && <p className={styles.quiet} role="status">
            {exported === "running" ? "Levando tua lista pro Spotify… " : "A última exportação terminou. "}
            <button type="button" className={styles.remove} onClick={() => setExportHidden(false)}>ver {exported === "running" ? "andamento" : "resultado"}</button>
          </p>}
          {kept.length === 0 ? (
            <p className={styles.quiet}>O que você curtir ou guardar fica aqui, pra levar pro Spotify.</p>
          ) : (
            <>
              <ol className={styles.kept}>
                {kept.map((item) => (
                  <li key={item.id}>
                    <span className={styles.keptTrack}>
                      {item.trackName} <span className={styles.keptHow}>{item.artistName}</span>
                    </span>
                    <span className={styles.keptHow}>{HOW[item.action]}</span>
                    <button type="button" className={styles.remove} onClick={() => selection.remove(item)} aria-label={`Remover ${item.trackName} da lista`}>remover</button>
                  </li>
                ))}
              </ol>
              <Respostas inline label="Levar">
                <Resposta onClick={() => void exportKept()}>levar {kept.length} pro Spotify</Resposta>
              </Respostas>
            </>
          )}
        </div>
      </section>

      <PenLayer pen={pen} signal={signal} reduced={reduced} />
      </div>

      {modalOpen && createPortal(
        <div className={styles.overlay}>
          <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="levar-titulo" className={styles.dialog}>
            <h2 id="levar-titulo">
              {exported === "running"
                ? "Levando pro Spotify…"
                : result?.error
                  ? "Não deu pra levar."
                  : `Achei ${result?.resolvedCount ?? 0} de ${result?.totalItems ?? kept.length}.`}
            </h2>
            {exported === "running" && <p>Tô procurando cada uma no catálogo do Spotify.</p>}
            {result?.error && <p data-kind="erro">{result.error}</p>}
            {result && !result.error && (
              <p>
                {result.mode === "SPOTIFY_API"
                  ? "A playlist já tá na tua conta."
                  : "Baixa a lista e abre no teu player, ou conecta o Spotify em ajustes pra eu criar a playlist direto."}
              </p>
            )}
            <Respostas inline label="Depois de levar">
              {result?.playlistUrl && <Resposta href={result.playlistUrl}>abrir no Spotify</Resposta>}
              {result?.m3uPayload && <Resposta onClick={() => downloadM3u(result)}>baixar .m3u</Resposta>}
              <Resposta onClick={() => setExportHidden(true)}>fechar</Resposta>
            </Respostas>
          </div>
        </div>, document.body
      )}
    </div>
  );
}
