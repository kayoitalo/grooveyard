"use client";

import { privateFetch } from "@/lib/http/private-fetch";

import { useReducedMotion } from "framer-motion";
import { ArrowUpRight, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Aviso } from "@/components/amigo/aviso";
import { Capa, Fala, PenLayer, Resposta, Respostas } from "@/components/amigo/fala";
import { band } from "@/components/amigo/gestures";
import { boxOf, textLines } from "@/components/amigo/measure";
import type { TraceGesture, WaveSpec } from "@/components/amigo/trace";
import { usePen, type PenDrawing } from "@/components/amigo/use-pen";
import { usePulse } from "@/components/amigo/use-pulse";
import { useSound } from "@/components/amigo/use-sound";
import styles from "./historico.module.css";

interface HistoryEvent {
  id: string;
  playedAt: string;
  rawArtistName: string;
  rawTrackName: string;
  rawAlbumName?: string | null;
  coverUrl?: string | null;
  previewUrl?: string | null;
  appleMusicUrl?: string | null;
}

interface HistoryPayload {
  events: HistoryEvent[];
  totalPages: number;
  totalItems: number;
  hourHistogram: number[];
  since: string | null;
  timezone: string;
}

const PAGE_SIZE = 30;

const count = (value: number) => value.toLocaleString("pt-BR");
const plays = (value: number) => `${count(value)} ${value === 1 ? "audição" : "audições"}`;
const hourWords = (hour: number) => (hour === 0 ? "meia-noite" : hour === 12 ? "meio-dia" : `${hour}h`);

/** Datas e horas no fuso de quem ouve — o mesmo das horas do gráfico. */
function formatters(timeZone: string) {
  return {
    key: new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }),
    day: new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "long", day: "numeric", month: "long" }),
    time: new Intl.DateTimeFormat("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit" }),
    month: new Intl.DateTimeFormat("pt-BR", { timeZone, month: "long", year: "numeric" }),
  };
}

/**
 * Tudo que tocou. Ele fala do teu horário (ou do que você procurou), com
 * as horas do dia como prova e a régua dele na hora que ele cita; embaixo
 * vem o registro, dia por dia. A prévia de uma faixa toca ali mesmo, e a
 * corda dele vibra por baixo da linha que está soando.
 */
export function Historico() {
  const reduced = Boolean(useReducedMotion());
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<HistoryPayload | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadedQuery, setLoadedQuery] = useState("");
  const [loadedPage, setLoadedPage] = useState(1);

  const stageRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const parts = useRef(new Map<string, HTMLElement>());
  const register = useCallback(
    (key: string) => (node: HTMLElement | null) => {
      if (node) parts.current.set(key, node);
      else parts.current.delete(key);
    },
    [],
  );

  const sound = useSound();
  const { stop } = sound;
  const signal = usePulse(stageRef, sound.playing, sound.read);

  // a busca espera a pessoa parar de digitar
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery((current) => {
        const next = search.trim();
        if (next !== current) setPage(1);
        return next;
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setFailed(false);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), search: query });
    privateFetch(`/api/history?${params}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`history ${response.status}`);
        return response.json() as Promise<HistoryPayload>;
      })
      .then((payload) => {
        setData(payload);
        setLoadedQuery(query);
        setLoadedPage(page);
        setFailed(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [page, query, attempt]);

  // outra página, outra busca: a prévia que tocava some da tela, então para
  useEffect(() => {
    stop();
  }, [page, query, stop]);

  const format = useMemo(() => formatters(data?.timezone ?? "America/Sao_Paulo"), [data?.timezone]);

  const hours = useMemo(() => (data?.hourHistogram.length === 24 ? data.hourHistogram : []), [data]);
  const total = hours.reduce((sum, value) => sum + value, 0);
  const peak = total > 0 ? hours.indexOf(Math.max(...hours)) : null;
  const max = peak === null ? 1 : hours[peak];

  const days = useMemo(() => {
    const grouped = new Map<string, HistoryEvent[]>();
    for (const event of data?.events ?? []) {
      const key = format.key.format(new Date(event.playedAt));
      const bucket = grouped.get(key);
      if (bucket) bucket.push(event);
      else grouped.set(key, [event]);
    }
    return [...grouped.entries()];
  }, [data, format]);

  const dayName = (key: string, sample: string) => {
    const today = format.key.format(new Date());
    const yesterday = format.key.format(new Date(Date.now() - 86_400_000));
    if (key === today) return "hoje";
    if (key === yesterday) return "ontem";
    return format.day.format(new Date(sample));
  };

  const sounding = (event: HistoryEvent) =>
    sound.playing && playingId === event.id && sound.current === event.previewUrl;

  const playRow = (event: HistoryEvent) => {
    if (!event.previewUrl) return;
    setPlayingId(event.id);
    sound.toggle(event.previewUrl);
  };

  // ---------- o que ele diz ----------

  const found = data?.totalItems ?? 0;
  let headline: string;
  let narrative: string;
  let mark: string[] | undefined;
  if (loadedQuery && found === 0) {
    headline = `Nada com “${loadedQuery}”.`;
    narrative = "Tenta um pedaço do nome do artista, da faixa ou do disco.";
  } else if (loadedQuery) {
    headline = `“${loadedQuery}” aparece em ${plays(found)}.`;
    narrative = peak === null ? "" : `O horário dessas é ${hourWords(peak)}.`;
    mark = [loadedQuery];
  } else {
    headline = peak === null ? "Tudo que tocou." : `Teu horário é ${hourWords(peak)}.`;
    narrative =
      peak === null
        ? ""
        : `É quando mais toca: ${count(hours[peak])} das ${plays(total)}${
            data?.since ? ` desde ${format.month.format(new Date(data.since))}` : ""
          }.`;
    mark = peak === null ? undefined : [hourWords(peak)];
  }

  // ---------- onde o traço vai ----------

  const peakId = `pico:${peak}:${query}`;
  const live = data?.events.find((event) => sounding(event)) ?? null;

  const draw = (origin: DOMRect): PenDrawing => {
    const gestures: TraceGesture[] = [];
    let wave: WaveSpec | null = null;
    const markNode = markRef.current;
    if (markNode) {
      const { lines, size } = textLines(markNode, origin);
      if (lines.length > 0) {
        const { strokes, width } = band(lines, size);
        gestures.push({ id: `grifo:${headline}`, layer: "under", strokes, width, cap: "butt" });
      }
    }
    const bar = parts.current.get("pico");
    if (bar) {
      const box = boxOf(bar, origin);
      const x = box.left + box.width / 2;
      // a régua dele na barra da hora citada: a própria barra, na cor dele
      gestures.push({
        id: peakId,
        layer: "over",
        strokes: [
          [
            { x, y: box.top + box.height },
            { x, y: box.top },
          ],
        ],
        width: box.width,
        cap: "butt",
      });
    }
    if (live) {
      const row = parts.current.get(`linha:${live.id}`);
      const text = parts.current.get(`texto:${live.id}`);
      if (row && text) {
        const [rowBox, textBox] = [boxOf(row, origin), boxOf(text, origin)];
        const y = rowBox.top + rowBox.height - 1;
        // a corda por baixo da linha que está soando: é da música, aparece já vibrando
        wave = {
          base: [
            { x: textBox.left, y },
            { x: rowBox.left + rowBox.width, y },
          ],
          amp: 6,
          inPlace: true,
          width: 1.5,
        };
      }
    }
    return { gestures, wave, notes: [] };
  };

  const pose = `${headline}|${page}|${peak}|${live?.id ?? ""}|${data?.events[0]?.id ?? ""}`;
  const pen = usePen(stageRef, draw, pose);

  // ---------- estados ----------

  if (!data && failed) {
    return (
      <Aviso headline="Me perdi no teu histórico." narrative="Deu erro do meu lado lendo o que você ouviu. Tenta de novo?">
        <Resposta onClick={() => setAttempt((current) => current + 1)}>tenta de novo</Resposta>
      </Aviso>
    );
  }

  if (!data) return <Aviso headline="Peraí, tô puxando teu histórico." />;

  if (data.totalItems === 0 && !loadedQuery && !query) {
    return (
      <Aviso
        headline="Ainda não ouvi nada teu."
        narrative="Me passa teu Last.fm que eu trago tudo que você já ouviu, dia por dia."
      >
        <Resposta href="/settings">conectar o Last.fm</Resposta>
      </Aviso>
    );
  }

  return (
    <div ref={stageRef} className={styles.stage}>
      <label className={styles.search}>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="procura artista, faixa ou disco"
          aria-label="Procurar no histórico"
        />
        {search && (
          <button type="button" className={styles.clear} onClick={() => setSearch("")}>
            limpar
          </button>
        )}
      </label>

      {busy && <p className={styles.update} role="status">Buscando… Os registros anteriores continuam aqui enquanto eu consulto.</p>}
      {sound.error && <p className={styles.updateError} role="alert">{sound.error}</p>}
      {failed && <div className={styles.updateError} role="alert">
        <p>Não consegui atualizar a busca. Os resultados abaixo são da última consulta que deu certo{loadedQuery ? `: “${loadedQuery}”` : ""}.</p>
        <Resposta onClick={() => setAttempt((current) => current + 1)}>tentar de novo</Resposta>
      </div>}


      <div className={styles.top}>
        <Fala
          level={1}
          window={loadedQuery ? "procurando no que tocou" : "tudo que tocou, da mais recente pra trás"}
          headline={headline}
          narrative={narrative || null}
          markRef={markRef}
          marked={pen.started.has(`grifo:${headline}`)}
          mark={mark}
        />
        {peak !== null && (
          <figure className={styles.hours}>
            <div className={styles.bars} aria-hidden="true">
              {hours.map((value, hour) => {
                const height = `${(value / max) * 100}%`;
                return (
                  <span
                    key={hour}
                    className={styles.col}
                    data-lit={hour === peak && pen.done.has(peakId)}
                    style={{ ["--h" as string]: height }}
                  >
                    <span
                      ref={hour === peak ? register("pico") : undefined}
                      className={styles.bar}
                      style={{ height }}
                      title={`${hourWords(hour)} · ${plays(value)}`}
                    />
                    {hour === peak && (
                      <span className={styles.peakNote}>
                        {hourWords(hour)} · {count(value)}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
            <div className={styles.axis} aria-hidden="true">
              {[0, 6, 12, 18, 23].map((hour) => (
                <span key={hour}>{String(hour).padStart(2, "0")}h</span>
              ))}
            </div>
            <figcaption className={styles.quiet}>
              {loadedQuery ? "quando tocam as que você procurou" : "quando você ouve, hora a hora"}, no teu fuso
            </figcaption>
            <details className={styles.hourDetails}>
              <summary>ver audições por horário</summary>
              <dl>{hours.map((value, hour) => <div key={hour}><dt>{hourWords(hour)}</dt><dd>{plays(value)}</dd></div>)}</dl>
            </details>
          </figure>
        )}
      </div>

      <div className={styles.log} aria-busy={busy}>
        {days.length === 0 && loadedQuery && <p className={styles.empty}>Nada por aqui com esse nome.</p>}
        {days.map(([key, events]) => (
          <section key={key} aria-label={dayName(key, events[0].playedAt)}>
            <header className={styles.dayHead}>
              <h2 className={styles.dayName}>{dayName(key, events[0].playedAt)}</h2>
              <span className={styles.dayCount}>{plays(events.length)}</span>
            </header>
            <ol className={styles.rows}>
              {events.map((event) => {
                const on = sounding(event);
                return (
                  <li key={event.id} ref={register(`linha:${event.id}`)} className={styles.row} data-playing={on}>
                    <span className={styles.time}>{format.time.format(new Date(event.playedAt))}</span>
                    <Capa
                      cover={{ url: event.coverUrl, title: event.rawAlbumName ?? event.rawTrackName, artist: event.rawArtistName }}
                      playing={on}
                      className={styles.thumb}
                      label={false}
                    />
                    <span ref={register(`texto:${event.id}`)} className={styles.what}>
                      <span className={styles.track}>{event.rawTrackName}</span>
                      <span className={styles.artist}>{event.rawArtistName}</span>
                    </span>
                    {on && event.appleMusicUrl ? (
                      <a className={styles.album} href={event.appleMusicUrl} target="_blank" rel="noreferrer">
                        abrir no Apple Music <ArrowUpRight size={11} aria-hidden="true" />
                      </a>
                    ) : (
                      <span className={styles.album}>{event.rawAlbumName ?? ""}</span>
                    )}
                    {event.previewUrl ? (
                      <button
                        type="button"
                        className={styles.play}
                        aria-pressed={on}
                        aria-label={`${on ? "Parar" : "Tocar"} a prévia de ${event.rawTrackName}`}
                        onClick={() => playRow(event)}
                      >
                        {on ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                      </button>
                    ) : (
                      <span aria-hidden="true" />
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>

      {data.totalPages > 1 && (
        <div className={styles.pages}>
          <span>
            página {count(loadedPage)} de {count(data.totalPages)}
          </span>
          <Respostas inline label="Páginas">
            <Resposta onClick={() => setPage(Math.max(1, loadedPage - 1))} disabled={busy || failed || loadedPage <= 1}>
              mais recentes
            </Resposta>
            <Resposta
              onClick={() => setPage(Math.min(data.totalPages, loadedPage + 1))}
              disabled={busy || failed || loadedPage >= data.totalPages}
            >
              mais antigas
            </Resposta>
          </Respostas>
        </div>
      )}

      <PenLayer pen={pen} signal={signal} reduced={reduced} />
    </div>
  );
}
