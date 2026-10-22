"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { SECTIONS, sectionFor } from "@/components/layout/sections";
import styles from "./app-shell.module.css";
import { LogoutButton } from "./logout-button";

/**
 * O cabeçalho do app: o nome e as telas, em texto. A tela atual é a que
 * está sublinhada — sem cor, porque cor aqui é só do amigo.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const current = sectionFor(pathname);
  const navRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const measure = () => shellRef.current?.style.setProperty("--bar-h", `${bar.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    measure();
    return () => observer.disconnect();
  }, []);

  // no celular a fileira rola: a tela atual precisa estar à vista
  useEffect(() => {
    navRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current.href]);

  return (
    <div ref={shellRef} className={styles.shell}>
      <header id="arcadium-header" ref={barRef} className={styles.bar}>
        <Link href="/overview" className={styles.wordmark} aria-label="Arcadium, voltar para a conversa">
          arcadium
        </Link>
        <nav ref={navRef} className={styles.nav} aria-label="Telas">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className={styles.link}
              aria-current={section.href === current.href ? "page" : undefined}
            >
              {section.label}
            </Link>
          ))}
        </nav>
        <LogoutButton />
      </header>
      <main className={styles.page}>{children}</main>
    </div>
  );
}
