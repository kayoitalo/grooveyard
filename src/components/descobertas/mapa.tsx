"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import styles from "./mapa.module.css";

export interface MapDot {
  id: string;
  /** 0..100, longe → perto */
  proximity: number;
  /** 0..100, obscuro → famoso */
  fame: number;
  done: boolean;
  current: boolean;
}

const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

const nearness = (value: number) =>
  value < 35 ? "longe do que você ouve" : value > 70 ? "perto do que você ouve" : "um passo pro lado";
const fameness = (value: number) =>
  value < 35 ? "quase ninguém conhece" : value > 70 ? "muita gente conhece" : "público médio";

/**
 * O mapa de descoberta: um quadrado só controla os dois eixos. Arrastar
 * move a mira sem atraso; soltar dispara a busca. As setas andam de 5 em
 * 5 (Shift anda 10) e a busca sai quando você para de apertar.
 */
export function Mapa({
  proximity,
  fame,
  dots,
  busy,
  onChange,
  onCommit,
}: {
  proximity: number;
  fame: number;
  dots: MapDot[];
  busy: boolean;
  /** Durante o arrasto: só move a mira. */
  onChange: (proximity: number, fame: number) => void;
  /** Ao soltar (ou parar nas setas): busca com esse ponto. */
  onCommit: (proximity: number, fame: number) => void;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const keyTimer = useRef(0);

  useEffect(() => () => window.clearTimeout(keyTimer.current), []);

  const read = (event: PointerEvent) => {
    const bounds = surface.current?.getBoundingClientRect();
    if (!bounds) return null;
    return {
      proximity: clamp(((event.clientX - bounds.left) / bounds.width) * 100),
      fame: clamp(100 - ((event.clientY - bounds.top) / bounds.height) * 100),
    };
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (busy) return;
    const step = event.shiftKey ? 10 : 5;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (!move) return;
    // as setas do mapa não podem virar "curti" ou "guardo" da tela
    event.preventDefault();
    event.stopPropagation();
    const next = { proximity: clamp(proximity + move[0]), fame: clamp(fame + move[1]) };
    onChange(next.proximity, next.fame);
    window.clearTimeout(keyTimer.current);
    keyTimer.current = window.setTimeout(() => onCommit(next.proximity, next.fame), 450);
  };

  const glide = dragging ? "none" : "left 150ms var(--glide), top 150ms var(--glide)";

  return (
    <div>
      <div
        ref={surface}
        role="group"
        tabIndex={0}
        aria-label={`Mapa de descoberta. Proximidade ${proximity}, fama ${fame}. As setas mudam o ponto.`}
        aria-busy={busy}
        className={styles.pad}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (busy) return;
          const point = read(event);
          if (!point) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
          onChange(point.proximity, point.fame);
        }}
        onPointerMove={(event) => {
          if (!dragging) return;
          const point = read(event);
          if (point) onChange(point.proximity, point.fame);
        }}
        onPointerUp={(event) => {
          if (!dragging) return;
          setDragging(false);
          const point = read(event);
          if (point) onCommit(point.proximity, point.fame);
        }}
        onPointerCancel={() => setDragging(false)}
      >
        <span className={styles.line} data-axis="x" style={{ left: `${proximity}%`, transition: glide }} />
        <span className={styles.line} data-axis="y" style={{ top: `${100 - fame}%`, transition: glide }} />
        {dots.map((dot) => (
          <span
            key={dot.id}
            className={styles.dot}
            data-done={dot.done}
            data-current={dot.current}
            style={{ left: `${dot.proximity}%`, top: `${100 - dot.fame}%` }}
          />
        ))}
        <span className={styles.aim} style={{ left: `${proximity}%`, top: `${100 - fame}%`, transition: glide }} />
        <span className={styles.corner} style={{ top: 6 }}>
          famoso
        </span>
        <span className={styles.corner} style={{ bottom: 6 }}>
          obscuro
        </span>
      </div>
      <div className={styles.axis} aria-hidden="true">
        <span>longe do que você ouve</span>
        <span>perto</span>
      </div>
      <p className={styles.readout}>
        {busy ? "procurando nesse canto…" : `${nearness(proximity)}, ${fameness(fame)} · ${dots.length} no mapa`}
      </p>
    </div>
  );
}
