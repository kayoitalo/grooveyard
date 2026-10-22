"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
 * O som do Arcadium: as prévias de 30s do catálogo da Apple. Toca uma
 * sequência — uma faixa só, ou duas com corte seco entre elas, que é o
 * "de repente" de uma transição — e deixa o sinal à disposição de quem
 * desenha: a corda do traço e o pulso da capa.
 *
 * A prévia do iTunes manda access-control-allow-origin: *, então com
 * crossOrigin="anonymous" o analisador lê o sinal de verdade. Cada elemento
 * de áudio só pode virar fonte uma vez: ficam guardados por URL.
 */

export interface SoundStep {
  url: string;
  /** Quanto tempo esta prévia toca antes do corte para a próxima. */
  seconds?: number;
}

export function useSound() {
  const context = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const buffer = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const elements = useRef(new Map<string, HTMLAudioElement>());
  const timers = useRef<number[]>([]);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playbackRun = useRef(0);
  const [step, setStep] = useState(0);
  /** A prévia que está soando agora: quem mostra "para aí" numa lista precisa saber qual. */
  const [current, setCurrent] = useState<string | null>(null);

  const graph = useCallback(() => {
    // contexto fechado não volta: elementos presos a ele também não servem mais
    if (context.current?.state === "closed") {
      context.current = null;
      elements.current.clear();
    }
    if (!context.current) {
      const ctx = new AudioContext();
      const node = ctx.createAnalyser();
      node.fftSize = 1024;
      node.smoothingTimeConstant = 0.55;
      node.connect(ctx.destination);
      context.current = ctx;
      analyser.current = node;
      buffer.current = new Uint8Array(node.fftSize);
    }
    // o navegador só deixa o contexto andar dentro de um gesto: é aqui
    void context.current.resume();
    return context.current;
  }, []);

  const element = useCallback(
    (url: string) => {
      let audio = elements.current.get(url);
      if (!audio) {
        audio = new Audio();
        audio.crossOrigin = "anonymous";
        audio.preload = "auto";
        audio.src = url;
        graph().createMediaElementSource(audio).connect(analyser.current!);
        elements.current.set(url, audio);
      }
      return audio;
    },
    [graph],
  );

  const stop = useCallback(() => {
    playbackRun.current += 1;
    setLoading(false);
    setError(null);
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    elements.current.forEach((audio) => {
      audio.onended = null;
      audio.pause();
    });
    setPlaying(false);
    setStep(0);
    setCurrent(null);
  }, []);

  const play = useCallback(
    (steps: SoundStep[]) => {
      stop();
      setError(null);
      if (steps.length === 0) return;
      const token = playbackRun.current;
      let queue: HTMLAudioElement[];
      // todas nascem já: o corte para a segunda tem que ser seco, sem espera de rede
      try {
        graph();
        queue = steps.map((entry) => element(entry.url));
      } catch {
        setError("Não consegui abrir a prévia. Tenta tocar de novo.");
        return;
      }

      const run = (index: number) => {
        if (token !== playbackRun.current) return;
        queue[index - 1]?.pause();
        const audio = queue[index];
        audio.currentTime = 0;
        setLoading(true);
        void audio.play().then(() => {
          if (token === playbackRun.current) setLoading(false);
        }).catch(() => {
          if (token !== playbackRun.current) return;
          stop();
          setError("Não consegui tocar a prévia. Confere a conexão e tenta de novo.");
        });
        setStep(index);
        setCurrent(steps[index].url);
        if (index < queue.length - 1) {
          timers.current.push(window.setTimeout(() => run(index + 1), (steps[index].seconds ?? 8) * 1000));
        } else {
          audio.onended = () => stop();
        }
      };

      setPlaying(true);
      run(0);
    },
    [element, graph, stop],
  );

  /** A mesma prévia pausa; outra troca a faixa no mesmo gesto. */
  const toggle = useCallback(
    (url: string) => {
      if (playing && current === url) stop();
      else play([{ url }]);
    },
    [current, play, playing, stop],
  );

  /** O sinal no tempo deste quadro (0–255) e o nível, de 0 a 1. */
  const read = useCallback((): { signal: Uint8Array | null; level: number } => {
    if (!analyser.current || !buffer.current) return { signal: null, level: 0 };
    analyser.current.getByteTimeDomainData(buffer.current);
    let sum = 0;
    for (const value of buffer.current) {
      const centered = (value - 128) / 128;
      sum += centered * centered;
    }
    return { signal: buffer.current, level: Math.min(1, Math.sqrt(sum / buffer.current.length) * 2.2) };
  }, []);

  useEffect(
    () => () => {
      stop();
      elements.current.clear();
      void context.current?.close().catch(() => undefined);
      context.current = null;
      analyser.current = null;
    },
    [stop],
  );

  return { playing, loading, error, step, current, play, stop, toggle, read };
}
