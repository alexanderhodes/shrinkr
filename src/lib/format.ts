import { FORMATS, type Format, type VariantSettings } from "./types";

const nf = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

/** Dezimale Einheiten (1 KB = 1000 Byte), wie im macOS-Finder. */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${nf0.format(bytes)} B`;
  if (bytes < 1000 * 1000) return `${nf.format(bytes / 1000)} KB`;
  return `${nf.format(bytes / (1000 * 1000))} MB`;
}

export function formatDimensions(w: number | null, h: number | null): string {
  return `${w ?? "auto"}x${h ?? "auto"}`;
}

/** Änderung gegenüber dem Original in Prozent, z. B. "−80 %" */
export function formatDelta(original: number, next: number): { text: string; better: boolean } {
  if (original <= 0) return { text: "", better: true };
  const pct = Math.round((1 - next / original) * 100);
  if (pct === 0) return { text: "±0 %", better: true };
  return pct > 0 ? { text: `−${pct} %`, better: true } : { text: `+${-pct} %`, better: false };
}

export function extensionFor(format: Format): string {
  return FORMATS.find((f) => f.value === format)?.ext ?? format;
}

export function labelFor(format: Format): string {
  return FORMATS.find((f) => f.value === format)?.label ?? format.toUpperCase();
}

export function describeSettings(s: VariantSettings): string {
  return `${formatDimensions(s.width, s.height)} · ${labelFor(s.format)}${s.format === "png" ? "" : ` · Q${s.quality}`}`;
}

/** Entfernt Zeichen, die in Dateinamen Ärger machen. */
export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
}

export function splitName(fileName: string): { base: string; ext: string } {
  const i = fileName.lastIndexOf(".");
  if (i <= 0) return { base: fileName, ext: "" };
  return { base: fileName.slice(0, i), ext: fileName.slice(i + 1).toLowerCase() };
}

export function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    case "gif":
      return "image/gif";
    case "bmp":
      return "image/bmp";
    case "tif":
    case "tiff":
      return "image/tiff";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    default:
      return "application/octet-stream";
  }
}

export function formatLabelFromExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === "jpg" || e === "jpeg") return "JPEG";
  if (e === "tif" || e === "tiff") return "TIFF";
  return e.toUpperCase();
}

export const ACCEPTED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "avif", "gif", "bmp", "tif", "tiff", "heic", "heif"];

export function isAcceptedName(name: string): boolean {
  return ACCEPTED_EXTENSIONS.includes(splitName(name).ext);
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function dirName(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i < 0 ? "" : path.slice(0, i);
}
