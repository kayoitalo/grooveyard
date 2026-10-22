"use client";

import { useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Fala, PenLayer, Resposta, Respostas } from "@/components/amigo/fala";
import { band, dimension, strike, type Point } from "@/components/amigo/gestures";
import { boxOf, textLines } from "@/components/amigo/measure";
import type { TraceGesture, WaveSpec } from "@/components/amigo/trace";
import { usePen, type PenDrawing, type PenNote } from "@/components/amigo/use-pen";
import { usePulse } from "@/components/amigo/use-pulse";
import { useSound, type SoundStep } from "@/components/amigo/use-sound";
import type { ConversationMoment, Evidence } from "@/modules/conversation/domain/conversation.types";
import { decadeLabel, ProvaDecadas, ProvaLista, ProvaTransicao } from "./provas";
import styles from "./conversa.module.css";

/*
 * A conversa: a tela inicial. Um fio que se rola e se revisita — o
 * assunto da vez é o que cruza o meio da tela, o que ele já disse fica
 * mais apagado, e o que você mandou esquecer fica riscado (e ele não
 * volta a falar daquilo: o navegador lembra).
 *
 * Cada frase chega com a prova que cita, sempre na tela e em repouso. O
 * traço dele grifa o fim da manchete, mede o salto entre duas capas e
 * passa a régua na barra citada; com música tocando, esse traço vira a
 * corda que vibra com o som de verdade.
 */

const FIM = {
  headline: "Por hoje é isso.",
  narrative: "Volta daqui a uns dias. Até lá eu já reparei em outra coisa.",
};

const REPLY = "Justo. Finge que eu não falei nada.";

/** Os assuntos que você mandou esquecer, por chave: ele não volta neles. */
const FORGOTTEN = "arcadium:esquecidos";

function readForgotten(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(FORGOTTEN) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeForgotten(update: (keys: string[]) => string[]) {
  try {
    // só os mais recentes: chave de leitura velha não volta mais mesmo
    window.localStorage.setItem(FORGOTTEN, JSON.stringify(update(readForgotten()).slice(-200)));
  } catch {
    // sem armazenamento, o esquecimento vale só para esta visita
  }
}

function stepsOf(evidence: Evidence | null | undefined): SoundStep[] {
  if (!evidence) return [];
  if (evidence.kind === "transition") {
    return [
      // a primeira toca um pouco e corta seco para a segunda: o "de repente"
      ...(evidence.from.previewUrl ? [{ url: evidence.from.previewUrl, seconds: 6.5 }] : []),
      ...(evidence.to.previewUrl ? [{ url: evidence.to.previewUrl }] : []),
    ];
  }
  if (evidence.kind === "ranking") return evidence.previewUrl ? [{ url: evidence.previewUrl }] : [];
  return [];
}

/** O que a prova sustenta, como a frase nomearia: se a manchete citar, o grifo vai ali. */
function marksOf(evidence: Evidence | null | undefined): string[] | undefined {
  if (!evidence) return undefined;
  if (evidence.kind === "transition") {
    // o "de repente" é a chegada: a segunda vem antes
    return [evidence.to.track, evidence.from.track, evidence.to.artist, evidence.from.artist];
  }
  if (evidence.kind === "ranking") {
    const row = evidence.rows[evidence.focusIndex];
    return [row.label, row.sub].filter(Boolean);
  }
  return evidence.focus.flatMap((decade) => [decadeLabel(decade), `${decade}s`]);
}

/** A régua dele em cima de uma barra do dado: a própria barra, na cor dele. */
function ruler(bar: HTMLElement, origin: DOMRect): { base: Point[]; box: ReturnType<typeof boxOf> } {
  const box = boxOf(bar, origin);
  const y = box.top + box.height / 2;
  return {
    base: [
      { x: box.left, y },
      { x: box.left + box.width, y },
    ],
    box,
  };
}

export function Conversa({ moments: all }: { moments: ConversationMoment[] }) {
  const reduced = Boolean(useReducedMotion());
  const [forgotten] = useState(() => new Set(readForgotten()));
  const moments = useMemo(() => all.filter((moment) => !forgotten.has(moment.key)), [all, forgotten]);
  // o fim também é um bloco do fio
  const total = moments.length + 1;

  const [active, setActive] = useState(0);
  const [seen, setSeen] = useState<number[]>([0]);
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [expanded, setExpanded] = useState<number[]>([]);
  const [cut, setCut] = useState(0);

  const stageRef = useRef<HTMLDivElement>(null);
  const parts = useRef(new Map<string, HTMLElement>());
  const dismissTimer = useRef(0);

  const register = useCallback(
    (index: number) => (part: string) => (node: HTMLElement | null) => {
      const key = `${index}:${part}`;
      if (node) parts.current.set(key, node);
      else parts.current.delete(key);
    },
    [],
  );

  const sound = useSound();
  const { stop, play } = sound;
  const signal = usePulse(stageRef, sound.playing, sound.read);
  const steps = useMemo(() => stepsOf(moments[active]?.evidence), [active, moments]);
  const playingSide: "from" | "to" | null = sound.playing
    ? sound.step === 0 && steps.length > 1
      ? "from"
      : "to"
    : null;

  // ---------- onde o traço vai ----------

  const pose = `${seen.join(",")}|${active}|${dismissed.join(",")}|${expanded.join(",")}|${sound.playing ? "som" : ""}`;

  const draw = (origin: DOMRect): PenDrawing => {
    const thin = Math.max(1.5, Math.min(2.5, origin.width / 600));
    const gestures: TraceGesture[] = [];
    const notes: PenNote[] = [];
    let wave: WaveSpec | null = null;

    for (const index of seen) {
      const dim = index !== active;
      const part = (name: string) => parts.current.get(`${index}:${name}`);

      if (dismissed.includes(index)) {
        const headline = part("headline");
        if (headline) {
          const { lines, size } = textLines(headline, origin);
          gestures.push({
            id: `${index}:risco`,
            layer: "over",
            strokes: strike(lines, size),
            width: Math.max(2, size * 0.055),
            cap: "butt",
            dim,
          });
        }
        continue;
      }

      const mark = part("mark");
      if (mark) {
        const { lines, size } = textLines(mark, origin);
        if (lines.length > 0) {
          const { strokes, width } = band(lines, size);
          gestures.push({ id: `${index}:grifo`, layer: "under", strokes, width, cap: "butt", dim });
        }
      }

      const evidence = moments[index]?.evidence;
      const live = sound.playing && index === active;

      if (evidence?.kind === "transition") {
        const from = part("from");
        const to = part("to");
        if (!from || !to) continue;
        const fromBox = boxOf(from, origin);
        const lift = Math.min(96, Math.max(52, fromBox.height * 0.42));
        const { posts, span, mid } = dimension(fromBox, boxOf(to, origin), lift);
        // com som, a travessa vira corda: as colunas ficam, ela vibra
        gestures.push({
          id: `${index}:cota`,
          layer: "over",
          strokes: live ? posts : [posts[0], span, posts[1]],
          width: thin,
          cap: "square",
          join: "miter",
          dim,
        });
        if (live) {
          wave = {
            base: span,
            amp: Math.min(40, lift * 0.55),
            inPlace: true,
            // só para baixo: para cima ela passaria pelo "PAM."
            outwardFrom: { x: mid.x, y: mid.y - 1000 },
            width: thin,
            cap: "square",
          };
        }
        notes.push({ id: `${index}:pam`, gesture: `${index}:cota`, text: "PAM.", x: mid.x, y: mid.y - 12, kind: "grito", dim });
        // embaixo da travessa é onde a corda vibra: tocando, o intervalo sai da frente (as horas seguem nas legendas)
        if (!live) {
          notes.push({
            id: `${index}:intervalo`,
            gesture: `${index}:cota`,
            text: evidence.gapMinutes < 1 ? "logo em seguida" : `${evidence.gapMinutes} min depois`,
            x: posts[1][0].x - 12,
            y: mid.y + 10,
            kind: "dado",
            align: "end",
            dim,
          });
        }
      } else if (evidence?.kind === "ranking") {
        const bar = part("bar");
        if (!bar) continue;
        const { base, box } = ruler(bar, origin);
        if (live) {
          // numa lista a folga é curta: a corda desce pouco e nunca alcança a anotação
          wave = { base, amp: 7, inPlace: true, outwardFrom: { x: box.left, y: base[0].y - 1000 }, width: box.height + 1, cap: "butt" };
        } else {
          gestures.push({ id: `${index}:regua`, layer: "over", strokes: [base], width: box.height + 1, cap: "butt", dim });
        }
      } else if (evidence?.kind === "decades") {
        for (const decade of evidence.focus) {
          const bar = part(`bar:${decade}`);
          if (!bar) continue;
          const { base, box } = ruler(bar, origin);
          gestures.push({ id: `${index}:regua:${decade}`, layer: "over", strokes: [base], width: box.height + 1, cap: "butt", dim });
        }
      }
    }

    return { gestures, wave, notes };
  };

  const pen = usePen(stageRef, draw, pose);
  const { forget } = pen;
  // o corte seco da transição: o "PAM." do assunto da vez grita de novo
  const notes = pen.notes.map((note) => (note.kind === "grito" && !note.dim ? { ...note, pop: cut } : note));

  // ---------- o assunto da vez ----------

  // o bloco que cruza o meio da tela é o assunto; quem já passou por ali fica no fio
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.index);
          setActive(index);
          setSeen((current) => (current.includes(index) ? current : [...current, index]));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (let index = 0; index < total; index += 1) {
      const block = parts.current.get(`${index}:block`);
      if (block) observer.observe(block);
    }
    return () => observer.disconnect();
  }, [total]);

  // mudou de assunto, a música daquele assunto para
  useEffect(() => {
    stop();
  }, [active, stop]);

  useEffect(() => {
    if (sound.playing && sound.step > 0) setCut((current) => current + 1);
  }, [sound.playing, sound.step]);

  // ---------- respostas ----------

  const go = useCallback(
    (index: number) => {
      const target = parts.current.get(`${Math.max(0, Math.min(total - 1, index))}:block`);
      target?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    },
    [reduced, total],
  );

  const activeDismissed = dismissed.includes(active);
  const atEnd = active >= moments.length;
  const activeEvidence = moments[active]?.evidence;
  const canExpand =
    !activeDismissed &&
    (activeEvidence?.kind === "transition" ||
      (activeEvidence?.kind === "ranking" && activeEvidence.rows.length > Math.max(5, activeEvidence.focusIndex + 1)));

  const toggleSound = useCallback(() => {
    if (steps.length === 0 || activeDismissed) return;
    if (sound.playing) stop();
    else play(steps);
  }, [activeDismissed, play, sound.playing, steps, stop]);

  const toggleMore = useCallback(() => {
    if (!canExpand) return;
    setExpanded((current) => (current.includes(active) ? current.filter((index) => index !== active) : [...current, active]));
  }, [active, canExpand]);

  /** "nada a ver" risca o assunto e o esquece; no assunto riscado, desfaz. */
  const dismiss = useCallback(() => {
    const moment = moments[active];
    if (!moment) return;
    window.clearTimeout(dismissTimer.current);
    if (activeDismissed) {
      setDismissed((current) => current.filter((index) => index !== active));
      writeForgotten((keys) => keys.filter((key) => key !== moment.key));
      return;
    }
    stop();
    setDismissed((current) => [...current, active]);
    setExpanded((current) => current.filter((index) => index !== active));
    forget(`${active}:`);
    writeForgotten((keys) => (keys.includes(moment.key) ? keys : [...keys, moment.key]));
    dismissTimer.current = window.setTimeout(() => go(active + 1), 1400);
  }, [active, activeDismissed, forget, go, moments, stop]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      // tecla sem foco em nada chega com o documento (ou a janela) como alvo
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      // em botão ou link com foco, Enter e espaço são dele
      if ((key === "enter" || key === " ") && target?.closest("button, a")) return;
      if (key === "arrowright" || key === "enter") {
        event.preventDefault();
        go(active >= total - 1 ? 0 : active + 1);
      } else if (key === "arrowleft") {
        event.preventDefault();
        go(active - 1);
      } else if (key === "t" || key === " ") {
        event.preventDefault();
        toggleSound();
      } else if (key === "m") toggleMore();
      else if (key === "n") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, dismiss, go, toggleMore, toggleSound, total]);

  useEffect(() => () => window.clearTimeout(dismissTimer.current), []);

  return (
    <div ref={stageRef} className={styles.stage}>
      {[...moments, null].map((moment, index) => {
        const isActive = index === active;
        const isDismissed = dismissed.includes(index);
        const isExpanded = expanded.includes(index);
        const refs = register(index);
        const evidence = moment?.evidence ?? null;
        return (
          <section
            id={`assunto-${index}`}
            key={moment?.key ?? "fim"}
            ref={refs("block")}
            data-index={index}
            className={styles.block}
            data-active={isActive}
            data-dismissed={isDismissed}
            data-end={!moment || undefined}
            aria-current={isActive ? "step" : undefined}
          >
            <Fala
              level={index === 0 ? 1 : 2}
              window={moment?.window}
              headline={moment?.headline ?? FIM.headline}
              narrative={moment?.narrative ?? FIM.narrative}
              insight={moment?.insight}
              closing={moment?.closing}
              reply={REPLY}
              active={isActive}
              dismissed={isDismissed}
              marked={pen.started.has(`${index}:grifo`)}
              headlineRef={refs("headline")}
              markRef={refs("mark")}
              mark={marksOf(evidence)}
            />

            {/* riscado o assunto, a prova continua ali, apagada: o dado não deixou de ser verdade */}
            {evidence?.kind === "transition" && (
              <ProvaTransicao
                evidence={evidence}
                expanded={isExpanded}
                playingSide={isActive ? playingSide : null}
                register={refs}
              />
            )}
            {evidence?.kind === "ranking" && (
              <ProvaLista
                evidence={evidence}
                expanded={isExpanded}
                playing={isActive && sound.playing}
                lit={!isDismissed && pen.done.has(`${index}:regua`)}
                register={refs}
              />
            )}
            {evidence?.kind === "decades" && (
              <ProvaDecadas
                evidence={evidence}
                lit={isDismissed ? [] : evidence.focus.filter((decade) => pen.done.has(`${index}:regua:${decade}`))}
                register={refs}
              />
            )}
          </section>
        );
      })}

      <PenLayer pen={{ ...pen, notes }} signal={signal} reduced={reduced} />

      <Respostas>
        {sound.error && <p className={styles.position} role="alert">{sound.error}</p>}
        <p className={styles.position} aria-live="polite" aria-atomic="true">
          {atEnd ? "Fim da conversa" : `Assunto ${active + 1} de ${moments.length} · ${moments[active]?.window ?? ""}`}
          {!atEnd && (steps.length > 0 ? " · prévia de 30s" : " · sem prévia neste assunto")}
        </p>
        {atEnd ? (
          <>
            <Resposta onClick={() => go(0)} hint="↵">
              de novo
            </Resposta>
            <Resposta href="/taste-evolution">o que mudou</Resposta>
            <Resposta href="/discovery">pra ouvir depois</Resposta>
          </>
        ) : (
          <>
            <Resposta onClick={toggleSound} disabled={steps.length === 0 || activeDismissed} hint="T">
              {sound.loading ? "carregando prévia…" : sound.playing ? "para aí" : "toca aí"}
            </Resposta>
            <Resposta onClick={() => go(active + 1)} hint="→" primary>
              e o que mais?
            </Resposta>
            <Resposta onClick={toggleMore} disabled={!canExpand} hint="M" expanded={expanded.includes(active)} controls={`assunto-${active}`}>
              {expanded.includes(active) ? "menos" : "me mostra mais"}
            </Resposta>
            <Resposta onClick={dismiss} hint="N">
              {activeDismissed ? "volta atrás" : "nada a ver"}
            </Resposta>
          </>
        )}
      </Respostas>
    </div>
  );
}
