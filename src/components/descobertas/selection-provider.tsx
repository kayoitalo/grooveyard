"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { addSelected, readSelection, selectionKey, type SelectedTrack } from "./selection";

interface Selection {
  items: SelectedTrack[];
  ready: boolean;
  add: (item: SelectedTrack) => void;
  remove: (item: SelectedTrack) => void;
}

const Context = createContext<Selection | null>(null);

/** Scoped to the signed-in account; survives map changes and navigation. No credentials are stored. */
export function SelectionProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [items, setItems] = useState<SelectedTrack[]>([]);
  const [ready, setReady] = useState(false);
  const key = `arcadium:selection:${userId}`;
  useEffect(() => {
    try { setItems(readSelection(window.localStorage.getItem(key))); } catch { setItems([]); }
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    try { window.localStorage.setItem(key, JSON.stringify(items)); } catch { /* Selection still works in memory. */ }
  }, [items, key, ready]);
  const add = useCallback((item: SelectedTrack) => setItems((current) => addSelected(current, item)), []);
  const remove = useCallback((item: SelectedTrack) => setItems((current) => current.filter((entry) => selectionKey(entry) !== selectionKey(item))), []);
  const value = useMemo(() => ({ items, ready, add, remove }), [items, ready, add, remove]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSelection() {
  const value = useContext(Context);
  if (!value) throw new Error("SelectionProvider missing");
  return value;
}
