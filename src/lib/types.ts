export type Format = "jpeg" | "png" | "webp" | "avif";
export type FitMode = "cover" | "contain";

export const FORMATS: { value: Format; label: string; ext: string }[] = [
  { value: "jpeg", label: "JPEG", ext: "jpg" },
  { value: "png", label: "PNG", ext: "png" },
  { value: "webp", label: "WEBP", ext: "webp" },
  { value: "avif", label: "AVIF", ext: "avif" },
];

export interface VariantSettings {
  /** null = automatisch (Seitenverhältnis bleibt erhalten) */
  width: number | null;
  height: number | null;
  format: Format;
  /** 1–100, bei PNG ohne Wirkung (verlustfrei) */
  quality: number;
  /** Nur relevant, wenn Breite und Höhe gesetzt sind */
  fit: FitMode;
}

export interface Preset extends VariantSettings {
  id: string;
  /** Wird automatisch zu jedem neu hinzugefügten Bild als Variante angelegt */
  auto: boolean;
}

export interface VariantResult {
  blob: Blob;
  width: number;
  height: number;
  size: number;
}

export interface Variant {
  id: string;
  settings: VariantSettings;
  /** Optionaler Dateiname-Zusatz; leer = automatisch "-BREITExHÖHE" */
  suffix: string;
  /** Wird bei jeder Änderung der Einstellungen erhöht, damit veraltete Ergebnisse verworfen werden */
  rev: number;
  status: "pending" | "working" | "done" | "error";
  result?: VariantResult;
  error?: string;
}

export interface SourceImage {
  id: string;
  /** Dateiname ohne Endung, im UI änderbar */
  name: string;
  /** Originaldatei-Endung in Großbuchstaben, z. B. JPEG */
  formatLabel: string;
  path?: string;
  blob: Blob;
  thumbUrl: string;
  width: number;
  height: number;
  size: number;
  variants: Variant[];
  error?: string;
}
