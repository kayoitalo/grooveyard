"use client";

import { useReducedMotion } from "framer-motion";
import { useCallback, useRef, type ReactNode } from "react";
import { Fala, PenLayer } from "@/components/amigo/fala";
import { band } from "@/components/amigo/gestures";
import { boxOf, textLines } from "@/components/amigo/measure";
import type { TraceGesture } from "@/components/amigo/trace";
import { usePen, type PenDrawing } from "@/components/amigo/use-pen";
import { genreLabel } from "@/lib/format/genre";
import { shiftSentence } from "@/modules/conversation/domain/shift-line";
import type { TasteShiftItem } from "@/modules/statistics/application/overview-service";
import styles from "./mudou.module.css";

const decimal = (value: number) => value.toString().replace(".", ",");

/** "+5,5 pontos", "−1,9 ponto": abaixo de dois, ponto fica no singular. */
function points(delta: number): string {
  const size = Math.abs(delta);
  return `${delta > 0 ? "+" : "−"}${decimal(size)} ${size < 2 ? "ponto" : "pontos"}`;
}

type Register = (key: string) => (node: HTMLElement | null) => void;

function Linha({
  item,
  scale,
  cited,
  lit,
  register,
}: {
  item: TasteShiftItem;
  scale: number;
  /** Ele cita este gênero: a anotação espera o traço terminar. */
  cited: boolean;
  lit: boolean;
  register: Register;
}) {
  const from = (item.previousShare / scale) * 100;
  const to = (item.currentShare / scale) * 100;
  return (
    <li className={styles.row} data-lit={lit}>
      <span className={styles.label}>{genreLabel(item.genre)}</span>
      <span className={styles.value}>
        {decimal(item.previousShare)}% → {decimal(item.currentShare)}%
      </span>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.segment} style={{ left: `${Math.min(from, to)}%`, width: `${Math.abs(to - from)}%` }} />
        <span ref={register(`de:${item.genre}`)} className={styles.from} style={{ left: `${from}%` }} />
        <span ref={register(`para:${item.genre}`)} className={styles.to} style={{ left: `${to}%` }} />
      </span>
      {cited && <span className={styles.note}>{points(item.delta)}</span>}
    </li>
  );
}

/**
 * A tela de "o que mudou" com dado: a fala dele (a frase do modelo que o
 * dado sustenta, ou o maior salto dito por ele) e os gêneros que mais
 * ganharam e perderam espaço. O traço percorre, na trilha do gênero
 * citado, o caminho de onde ele estava até onde chegou.
 */
export function Mudou({
  shift,
  headline,
  cited,
  window: when,
}: {
  shift: { rising: TasteShiftItem[]; declining: TasteShiftItem[] };
  headline: string;
  /** Os gêneros que a fala cita, na ordem em que ele fala deles. */
  cited: string[];
  window: ReactNode;
}) {
  const reduced = Boolean(useReducedMotion());
  const stageRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const parts = useRef(new Map<string, HTMLElement>());
  const silence = useRef<ArrayLike<number> | null>(null);

  const register = useCallback<Register>(
    (key) => (node) => {
      if (node) parts.current.set(key, node);
      else parts.current.delete(key);
    },
    [],
  );

  const items = [...shift.rising, ...shift.declining];
  const citedItems = cited
    .map((genre) => items.find((item) => item.genre === genre))
    .filter((item): item is TasteShiftItem => Boolean(item))
    .slice(0, 2);
  // uma escala só para os dois lados, senão as distâncias mentem
  const scale = Math.max(1, ...items.flatMap((item) => [item.previousShare, item.currentShare]));

  const draw = (origin: DOMRect): PenDrawing => {
    const gestures: TraceGesture[] = [];
    const mark = markRef.current;
    if (mark) {
      const { lines, size } = textLines(mark, origin);
      if (lines.length > 0) {
        const { strokes, width } = band(lines, size);
        gestures.push({ id: "grifo", layer: "under", strokes, width, cap: "butt" });
      }
    }
    for (const item of citedItems) {
      const from = parts.current.get(`de:${item.genre}`);
      const to = parts.current.get(`para:${item.genre}`);
      if (!from || !to) continue;
      const [a, b] = [boxOf(from, origin), boxOf(to, origin)];
      const [ax, bx] = [a.left + a.width / 2, b.left + b.width / 2];
      const direction = Math.sign(bx - ax) || 1;
      const y = a.top + a.height / 2;
      // de borda a borda: os dois quadrados continuam à vista, o caminho entre eles é dele
      gestures.push({
        id: `trilha:${item.genre}`,
        layer: "over",
        strokes: [
          [
            { x: ax + (direction * a.width) / 2, y },
            { x: bx - (direction * b.width) / 2, y },
          ],
        ],
        width: 4,
        cap: "butt",
      });
    }
    return { gestures, wave: null, notes: [] };
  };

  const pose = `${headline}|${citedItems.map((item) => item.genre).join(",")}|${items.map((item) => item.genre).join(",")}`;
  const pen = usePen(stageRef, draw, pose);

  const group = (title: string, list: TasteShiftItem[]) =>
    list.length > 0 && (
      <section className={styles.group} aria-label={title}>
        <h2 className={styles.groupTitle}>{title}</h2>
        <ol className={styles.rows}>
          {list.map((item) => (
            <Linha
              key={item.genre}
              item={item}
              scale={scale}
              cited={citedItems.includes(item)}
              lit={pen.done.has(`trilha:${item.genre}`)}
              register={register}
            />
          ))}
        </ol>
      </section>
    );

  return (
    <div ref={stageRef} className={styles.stage}>
      <div className={styles.block}>
        <Fala
          level={1}
          window={when}
          headline={headline}
          narrative={shiftSentence(citedItems)}
          markRef={markRef}
          marked={pen.started.has("grifo")}
          mark={citedItems.flatMap((item) => [genreLabel(item.genre), item.genre])}
        />
        <div className={styles.proof}>
          <p className={styles.legend}><span className={styles.legendFrom} aria-hidden="true" /> antes <span className={styles.legendTo} aria-hidden="true" /> agora · participação na escuta com gênero conhecido</p>
          {group("ganhou espaço", shift.rising)}
          {group("perdeu espaço", shift.declining)}
          <p className={styles.quiet}>
            Quanto cada gênero ocupou do que você ouviu. O quadrado vazado é o período anterior; o cheio, agora.
          </p>
        </div>
      </div>
      <PenLayer pen={pen} signal={silence} reduced={reduced} />
    </div>
  );
}
