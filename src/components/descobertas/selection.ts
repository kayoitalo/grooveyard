import { z } from "zod";

const selectionItem = z.object({
  id: z.string().min(1).max(200),
  trackName: z.string().min(1).max(1000),
  artistName: z.string().min(1).max(1000),
  action: z.enum(["liked", "saved"]),
});

export type SelectedTrack = z.infer<typeof selectionItem>;
export const MAX_SELECTED_TRACKS = 200;
export const selectionKey = (item: Pick<SelectedTrack, "artistName" | "trackName">) =>
  `${item.artistName.trim().toLowerCase()}\u0000${item.trackName.trim().toLowerCase()}`;

export function addSelected(items: SelectedTrack[], item: SelectedTrack): SelectedTrack[] {
  const key = selectionKey(item);
  const other = items.filter((entry) => selectionKey(entry) !== key);
  if (other.length >= MAX_SELECTED_TRACKS) return items;
  return [...other, item];
}

export function readSelection(raw: string | null): SelectedTrack[] {
  try {
    const result = z.array(selectionItem).max(MAX_SELECTED_TRACKS).safeParse(JSON.parse(raw ?? "[]"));
    return result.success ? result.data.reduce(addSelected, [] as SelectedTrack[]) : [];
  } catch { return []; }
}
