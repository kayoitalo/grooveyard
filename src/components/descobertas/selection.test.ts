import { describe, expect, it } from "vitest";
import { addSelected, readSelection, type SelectedTrack } from "./selection";

const track = (id: string, artistName = "Daft Punk", trackName = "Get Lucky"): SelectedTrack => ({ id, artistName, trackName, action: "saved" });

describe("discovery selection", () => {
  it("keeps tracks selected in previous search queues", () => {
    const firstSearch = addSelected([], track("first"));
    const anotherSearch = addSelected(firstSearch, track("second", "The Cure", "Boys Don't Cry"));
    expect(anotherSearch.map((item) => item.id)).toEqual(["first", "second"]);
    expect(readSelection(JSON.stringify(anotherSearch))).toEqual(anotherSearch);
  });
  it("keeps one entry when a new session recommends the same track again", () => {
    const selected = addSelected([track("old-session")], { ...track("new-session", " daft punk ", "get lucky"), action: "liked" });
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({ id: "new-session", action: "liked" });
  });
  it("rejects corrupt or invalid cached selections", () => {
    expect(readSelection("not json")).toEqual([]);
    expect(readSelection('{"items":[]}')).toEqual([]);
    expect(readSelection('[{"id":"unknown","action":"DISLIKED"}]')).toEqual([]);
  });
  it("never silently drops a previous selection when the list is full", () => {
    const all = Array.from({ length: 200 }, (_, i) => track(String(i), "Artist", `Track ${i}`));
    const result = addSelected(all, track("latest"));
    expect(result).toHaveLength(200);
    expect(result).toEqual(all);
    expect(result.some((item) => item.id === "0")).toBe(true);
  });
});
