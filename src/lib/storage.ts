import type { Preset, VariantSettings } from "./types";

const PRESETS_KEY = "shrinkr.presets.v1";
const LAST_KEY = "shrinkr.lastSettings.v1";
const OUTDIR_KEY = "shrinkr.outputDir.v1";
const SESSION_KEY = "shrinkr.session.v1";

export const DEFAULT_SETTINGS: VariantSettings = {
  width: 1600,
  height: null,
  format: "webp",
  quality: 80,
  fit: "cover",
};

const DEFAULT_PRESETS: Preset[] = [
  { id: "default-1600-webp", width: 1600, height: null, format: "webp", quality: 80, fit: "cover", auto: true },
];

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Speicher nicht verfügbar – Einstellungen gelten dann nur für diese Sitzung */
  }
}

export function loadPresets(): Preset[] {
  return read<Preset[]>(PRESETS_KEY) ?? DEFAULT_PRESETS;
}

export function savePresets(presets: Preset[]): void {
  write(PRESETS_KEY, presets);
}

export function loadLastSettings(): VariantSettings {
  return { ...DEFAULT_SETTINGS, ...(read<VariantSettings>(LAST_KEY) ?? {}) };
}

export function saveLastSettings(s: VariantSettings): void {
  write(LAST_KEY, s);
}

export function loadOutputDir(): string | null {
  return read<string>(OUTDIR_KEY);
}

export function saveOutputDir(dir: string | null): void {
  write(OUTDIR_KEY, dir);
}

/** Zuletzt geladene Bilder (nur Pfade und Varianten-Einstellungen, keine Bilddaten). */
export interface SavedImage {
  path: string;
  name: string;
  variants: { settings: VariantSettings; suffix: string }[];
}

export function loadSession(): SavedImage[] {
  return read<SavedImage[]>(SESSION_KEY) ?? [];
}

export function saveSession(items: SavedImage[]): void {
  write(SESSION_KEY, items);
}
