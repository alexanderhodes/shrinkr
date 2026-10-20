// Brücke zu Tauri. Im normalen Browser (npm run dev) sind die Funktionen nicht verfügbar;
// die App fällt dann auf Dateiauswahl und Downloads zurück.
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ACCEPTED_EXTENSIONS } from "./format";

export const isTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function expandPaths(paths: string[]): Promise<string[]> {
  return invoke<string[]>("expand_paths", { paths });
}

export async function readFile(path: string): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("read_file", { path });
}

export async function writeFile(path: string, data: ArrayBuffer): Promise<void> {
  await invoke("write_file", new Uint8Array(data), { headers: { path: encodeURIComponent(path) } });
}

export async function revealInFinder(path: string): Promise<void> {
  await invoke("reveal_in_finder", { path });
}

export async function pickImagePaths(): Promise<string[]> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const result = await open({
    multiple: true,
    filters: [{ name: "Bilder", extensions: ACCEPTED_EXTENSIONS }],
  });
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

export async function pickFolder(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const result = await open({ directory: true, multiple: false });
  return typeof result === "string" ? result : null;
}

/** Hört auf Dateien, die auf das Fenster gezogen werden (liefert echte Dateipfade). */
export async function listenForDrops(handlers: {
  onPaths: (paths: string[]) => void;
  onHover: (active: boolean) => void;
}): Promise<() => void> {
  return getCurrentWebview().onDragDropEvent((event) => {
    const p = event.payload;
    if (p.type === "enter" || p.type === "over") handlers.onHover(true);
    else if (p.type === "leave") handlers.onHover(false);
    else if (p.type === "drop") {
      handlers.onHover(false);
      handlers.onPaths(p.paths);
    }
  });
}

/** Browser-Fallback: Datei als Download speichern. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
