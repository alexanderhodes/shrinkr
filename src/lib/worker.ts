/// <reference lib="webworker" />
// Bildverarbeitung komplett lokal: Decode (nativ, mit EXIF-Drehung) → Resize (Lanczos3) → Encode (WASM).
import { decode as decodeJpeg, encode as encodeJpeg } from "@jsquash/jpeg";
import { decode as decodePng, encode as encodePng } from "@jsquash/png";
import { decode as decodeWebp, encode as encodeWebp } from "@jsquash/webp";
import { decode as decodeAvif, encode as encodeAvif } from "@jsquash/avif";
import { optimise as optimisePng } from "@jsquash/oxipng";
import resize from "@jsquash/resize";
import type { VariantSettings } from "./types";

export type WorkerRequest =
  | { id: number; kind: "probe"; blob: Blob }
  | { id: number; kind: "process"; blob: Blob; settings: VariantSettings };

export type WorkerResponse =
  | { id: number; ok: true; kind: "probe"; width: number; height: number }
  | { id: number; ok: true; kind: "process"; blob: Blob; width: number; height: number }
  | { id: number; ok: false; error: string };

type Sniffed = "jpeg" | "png" | "webp" | "avif" | "unknown";

async function sniff(blob: Blob): Promise<Sniffed> {
  const b = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xd8) return "jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (ascii(4, 8) === "ftyp" && /avif|avis/.test(ascii(8, 16))) return "avif";
  return "unknown";
}

/** Bevorzugt das System (korrekte EXIF-Drehung, auch GIF/BMP/TIFF/HEIC je nach macOS), sonst WASM-Decoder. */
async function decodeImage(blob: Blob): Promise<ImageData> {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Kein 2D-Kontext");
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch (nativeError) {
    const kind = await sniff(blob);
    const buffer = await blob.arrayBuffer();
    let decoded: ImageData | null = null;
    if (kind === "jpeg") decoded = await decodeJpeg(buffer);
    else if (kind === "png") decoded = await decodePng(buffer);
    else if (kind === "webp") decoded = await decodeWebp(buffer);
    else if (kind === "avif") decoded = await decodeAvif(buffer);
    if (!decoded) {
      throw new Error(
        `Dieses Bildformat kann nicht gelesen werden (${nativeError instanceof Error ? nativeError.message : "unbekannt"}).`,
      );
    }
    return decoded;
  }
}

function cropImageData(src: ImageData, x: number, y: number, w: number, h: number): ImageData {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    const start = ((y + row) * src.width + x) * 4;
    out.set(src.data.subarray(start, start + w * 4), row * w * 4);
  }
  return new ImageData(out, w, h);
}

/** Berechnet Zielgröße und ggf. Zuschnitt (zentriert) aus den Einstellungen. */
function plan(srcW: number, srcH: number, s: VariantSettings) {
  const { width, height } = s;
  if (!width && !height) return { w: srcW, h: srcH, crop: null };
  if (width && !height) return { w: width, h: Math.max(1, Math.round((srcH * width) / srcW)), crop: null };
  if (!width && height) return { w: Math.max(1, Math.round((srcW * height) / srcH)), h: height, crop: null };
  const w = width as number;
  const h = height as number;
  if (s.fit === "contain") {
    const scale = Math.min(w / srcW, h / srcH);
    return { w: Math.max(1, Math.round(srcW * scale)), h: Math.max(1, Math.round(srcH * scale)), crop: null };
  }
  // cover: Quelle zentriert auf das Zielverhältnis zuschneiden
  const targetRatio = w / h;
  const srcRatio = srcW / srcH;
  let cw = srcW;
  let ch = srcH;
  if (srcRatio > targetRatio) cw = Math.max(1, Math.round(srcH * targetRatio));
  else ch = Math.max(1, Math.round(srcW / targetRatio));
  return { w, h, crop: { x: Math.round((srcW - cw) / 2), y: Math.round((srcH - ch) / 2), w: cw, h: ch } };
}

/** JPEG kennt keine Transparenz: Pixel auf Weiß legen. */
function flattenOnWhite(img: ImageData): void {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 255) continue;
    const f = a / 255;
    d[i] = Math.round(d[i] * f + 255 * (1 - f));
    d[i + 1] = Math.round(d[i + 1] * f + 255 * (1 - f));
    d[i + 2] = Math.round(d[i + 2] * f + 255 * (1 - f));
    d[i + 3] = 255;
  }
}

async function process(blob: Blob, s: VariantSettings) {
  let img = await decodeImage(blob);
  const p = plan(img.width, img.height, s);
  if (p.crop) img = cropImageData(img, p.crop.x, p.crop.y, p.crop.w, p.crop.h);
  if (img.width !== p.w || img.height !== p.h) {
    img = await resize(img, { width: p.w, height: p.h, method: "lanczos3" });
  }

  let out: ArrayBuffer;
  let type: string;
  switch (s.format) {
    case "jpeg":
      flattenOnWhite(img);
      out = await encodeJpeg(img, { quality: s.quality });
      type = "image/jpeg";
      break;
    case "webp":
      out = await encodeWebp(img, { quality: s.quality });
      type = "image/webp";
      break;
    case "avif":
      out = await encodeAvif(img, { quality: s.quality });
      type = "image/avif";
      break;
    case "png": {
      const raw = await encodePng(img);
      out = await optimisePng(raw, { level: 3 });
      type = "image/png";
      break;
    }
  }
  return { blob: new Blob([out], { type }), width: img.width, height: img.height };
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    if (msg.kind === "probe") {
      const img = await decodeImage(msg.blob);
      const res: WorkerResponse = { id: msg.id, ok: true, kind: "probe", width: img.width, height: img.height };
      (self as unknown as Worker).postMessage(res);
    } else {
      const r = await process(msg.blob, msg.settings);
      const res: WorkerResponse = { id: msg.id, ok: true, kind: "process", ...r };
      (self as unknown as Worker).postMessage(res);
    }
  } catch (e) {
    const res: WorkerResponse = { id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) };
    (self as unknown as Worker).postMessage(res);
  }
};
