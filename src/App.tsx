import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./components/Icon";
import { ImageCard } from "./components/ImageCard";
import { Sidebar } from "./components/Sidebar";
import { VariantPanel } from "./components/VariantPanel";
import {
  ACCEPTED_EXTENSIONS,
  baseName,
  dirName,
  extensionFor,
  formatBytes,
  formatLabelFromExt,
  isAcceptedName,
  mimeFromExt,
  sanitizeFileName,
  splitName,
} from "./lib/format";
import { probeImage, processImage, StaleError } from "./lib/process";
import {
  loadLastSettings,
  loadOutputDir,
  loadPresets,
  saveLastSettings,
  saveOutputDir,
  savePresets,
} from "./lib/storage";
import {
  downloadBlob,
  expandPaths,
  isTauri,
  listenForDrops,
  pickFolder,
  pickImagePaths,
  readFile,
  revealInFinder,
  writeFile,
} from "./lib/tauri";
import type { Preset, SourceImage, Variant, VariantSettings } from "./lib/types";

interface IncomingFile {
  name: string;
  blob: Blob;
  path?: string;
}

const uid = () => crypto.randomUUID();

function newVariant(settings: VariantSettings, suffix = ""): Variant {
  return { id: uid(), settings: { ...settings }, suffix, rev: 0, status: "pending" };
}

function sameSettings(a: VariantSettings, b: VariantSettings): boolean {
  return a.width === b.width && a.height === b.height && a.format === b.format && a.quality === b.quality && a.fit === b.fit;
}

export default function App() {
  const [images, setImages] = useState<SourceImage[]>([]);
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [lastSettings, setLastSettings] = useState<VariantSettings>(loadLastSettings);
  const [outputDir, setOutputDir] = useState<string | null>(loadOutputDir);
  const [editing, setEditing] = useState<{ imageId: string; variantId: string } | null>(null);
  const [hover, setHover] = useState(false);
  const [loading, setLoading] = useState(0);
  const [notice, setNotice] = useState<{ text: string; revealPath?: string; error?: boolean } | null>(null);
  const [exporting, setExporting] = useState(false);
  const desktop = isTauri();

  const imagesRef = useRef(images);
  imagesRef.current = images;
  const presetsRef = useRef(presets);
  presetsRef.current = presets;
  const started = useRef(new Set<string>());

  /* ---------- Bilder hinzufügen ---------- */

  const addIncoming = useCallback(async (files: IncomingFile[]) => {
    const fresh = files.filter(
      (f) => isAcceptedName(f.name) && !(f.path && imagesRef.current.some((i) => i.path === f.path)),
    );
    if (fresh.length === 0) {
      if (files.length > 0) setNotice({ text: "Keine unterstützten Bilddateien gefunden.", error: true });
      return;
    }
    setLoading((n) => n + fresh.length);
    const autoSettings = presetsRef.current.filter((p) => p.auto);
    const created = await Promise.all(
      fresh.map(async (f): Promise<SourceImage> => {
        const { base, ext } = splitName(f.name);
        const image: SourceImage = {
          id: uid(),
          name: base,
          formatLabel: formatLabelFromExt(ext),
          path: f.path,
          blob: f.blob,
          thumbUrl: URL.createObjectURL(f.blob),
          width: 0,
          height: 0,
          size: f.blob.size,
          variants: [],
        };
        try {
          const dims = await probeImage(f.blob);
          image.width = dims.width;
          image.height = dims.height;
          image.variants = autoSettings.map((p) => newVariant(p));
        } catch (e) {
          image.error = e instanceof Error ? e.message : "Bild konnte nicht gelesen werden.";
        }
        return image;
      }),
    );
    setImages((prev) => [...prev, ...created]);
    setLoading((n) => n - fresh.length);
    setNotice(null);
  }, []);

  const addFromPaths = useCallback(
    async (paths: string[]) => {
      try {
        const files = await expandPaths(paths);
        const incoming = await Promise.all(
          files.map(async (path): Promise<IncomingFile> => {
            const name = baseName(path);
            const bytes = await readFile(path);
            return { name, path, blob: new Blob([bytes], { type: mimeFromExt(splitName(name).ext) }) };
          }),
        );
        await addIncoming(incoming);
      } catch (e) {
        setNotice({ text: `Dateien konnten nicht geladen werden: ${e instanceof Error ? e.message : String(e)}`, error: true });
      }
    },
    [addIncoming],
  );

  const addFromFileList = useCallback(
    (list: FileList | File[]) => addIncoming(Array.from(list).map((f) => ({ name: f.name, blob: f }))),
    [addIncoming],
  );

  // Drag & Drop: in der Desktop-App kommen echte Pfade von Tauri, im Browser normale HTML5-Events.
  useEffect(() => {
    if (desktop) {
      let off: (() => void) | undefined;
      let cancelled = false;
      listenForDrops({ onPaths: (p) => void addFromPaths(p), onHover: setHover }).then((fn) => {
        if (cancelled) fn();
        else off = fn;
      });
      return () => {
        cancelled = true;
        off?.();
      };
    }
    const over = (e: DragEvent) => {
      e.preventDefault();
      setHover(true);
    };
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setHover(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setHover(false);
      if (e.dataTransfer?.files.length) void addFromFileList(e.dataTransfer.files);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [desktop, addFromPaths, addFromFileList]);

  const fileInput = useRef<HTMLInputElement>(null);
  const chooseFiles = async () => {
    if (desktop) {
      const paths = await pickImagePaths();
      if (paths.length) await addFromPaths(paths);
    } else {
      fileInput.current?.click();
    }
  };

  /* ---------- Verarbeitung ---------- */

  useEffect(() => {
    for (const img of images) {
      for (const v of img.variants) {
        if (v.status !== "pending") continue;
        const key = `${v.id}:${v.rev}`;
        if (started.current.has(key)) continue;
        started.current.add(key);
        const { id: imageId } = img;
        const variantId = v.id;
        const rev = v.rev;
        const isStale = () => {
          const i = imagesRef.current.find((x) => x.id === imageId);
          const vv = i?.variants.find((x) => x.id === variantId);
          return !vv || vv.rev !== rev;
        };
        setImages((prev) => mapVariant(prev, imageId, variantId, (vv) => (vv.rev === rev ? { ...vv, status: "working" } : vv)));
        processImage(img.blob, v.settings, isStale)
          .then((result) =>
            setImages((prev) =>
              mapVariant(prev, imageId, variantId, (vv) =>
                vv.rev === rev ? { ...vv, status: "done", result, error: undefined } : vv,
              ),
            ),
          )
          .catch((err: unknown) => {
            if (err instanceof StaleError) return;
            setImages((prev) =>
              mapVariant(prev, imageId, variantId, (vv) =>
                vv.rev === rev ? { ...vv, status: "error", error: err instanceof Error ? err.message : String(err) } : vv,
              ),
            );
          });
      }
    }
  }, [images]);

  /* ---------- Änderungen an Bildern / Varianten ---------- */

  const rememberSettings = (s: VariantSettings) => {
    setLastSettings(s);
    saveLastSettings(s);
  };

  const addVariant = (imageId: string, settings: VariantSettings = lastSettings) => {
    const v = newVariant(settings);
    setImages((prev) => prev.map((i) => (i.id === imageId ? { ...i, variants: [...i.variants, v] } : i)));
    setEditing({ imageId, variantId: v.id });
  };

  const changeSettings = (imageId: string, variantId: string, settings: VariantSettings) => {
    rememberSettings(settings);
    setImages((prev) =>
      mapVariant(prev, imageId, variantId, (v) =>
        sameSettings(v.settings, settings) ? v : { ...v, settings, rev: v.rev + 1, status: "pending" },
      ),
    );
  };

  const deleteVariant = (imageId: string, variantId: string) => {
    setImages((prev) => prev.map((i) => (i.id === imageId ? { ...i, variants: i.variants.filter((v) => v.id !== variantId) } : i)));
    setEditing(null);
  };

  const removeImage = (imageId: string) => {
    setImages((prev) => {
      const gone = prev.find((i) => i.id === imageId);
      if (gone) URL.revokeObjectURL(gone.thumbUrl);
      return prev.filter((i) => i.id !== imageId);
    });
    setEditing((e) => (e?.imageId === imageId ? null : e));
  };

  const clearAll = () => {
    for (const i of imagesRef.current) URL.revokeObjectURL(i.thumbUrl);
    setImages([]);
    setEditing(null);
    setNotice(null);
  };

  /* ---------- Presets ---------- */

  const updatePresets = (next: Preset[]) => {
    setPresets(next);
    savePresets(next);
  };

  const savePreset = (settings: VariantSettings) => {
    if (presets.some((p) => sameSettings(p, settings))) {
      setNotice({ text: "Dieses Preset gibt es bereits." });
      return;
    }
    updatePresets([...presets, { ...settings, id: uid(), auto: false }]);
    setNotice({ text: "Preset gespeichert – du findest es links in der Seitenleiste." });
  };

  const applyToAll = (settings: VariantSettings) => {
    setImages((prev) =>
      prev.map((i) =>
        i.error || i.variants.some((v) => sameSettings(v.settings, settings)) ? i : { ...i, variants: [...i.variants, newVariant(settings)] },
      ),
    );
  };

  /* ---------- Export ---------- */

  const anyBusy = images.some((i) => i.variants.some((v) => v.status === "pending" || v.status === "working"));
  const readyCount = images.reduce((n, i) => n + i.variants.filter((v) => v.status === "done").length, 0);
  const totalBytes = images.reduce((n, i) => n + i.variants.reduce((m, v) => m + (v.result?.size ?? 0), 0), 0);

  const exportImages = async (list: SourceImage[]) => {
    setExporting(true);
    setNotice(null);
    const used = new Set<string>();
    let written = 0;
    let lastPath: string | undefined;
    try {
      for (const img of list) {
        for (const v of img.variants) {
          const r = v.result;
          if (v.status !== "done" || !r) continue;
          const ext = extensionFor(v.settings.format);
          const stem = `${sanitizeFileName(img.name) || "bild"}${v.suffix.trim() ? sanitizeFileName(v.suffix) : `-${r.width}x${r.height}`}`;
          if (desktop) {
            const dir = outputDir ?? (img.path ? dirName(img.path) : "");
            if (!dir) throw new Error("Kein Ausgabeordner bekannt. Bitte oben einen Ordner wählen.");
            let candidate = `${dir}/${stem}.${ext}`;
            let n = 2;
            while (used.has(candidate) || candidate === img.path) candidate = `${dir}/${stem}-${n++}.${ext}`;
            used.add(candidate);
            await writeFile(candidate, await r.blob.arrayBuffer());
            lastPath = candidate;
          } else {
            let name = `${stem}.${ext}`;
            let n = 2;
            while (used.has(name)) name = `${stem}-${n++}.${ext}`;
            used.add(name);
            downloadBlob(r.blob, name);
          }
          written++;
        }
      }
      setNotice({
        text:
          written === 0
            ? "Nichts zu exportieren – füge zuerst eine Variante hinzu."
            : `${written} ${written === 1 ? "Datei" : "Dateien"} gespeichert${desktop ? (outputDir ? ` in ${baseName(outputDir)}` : " neben den Originalen") : " (Downloads)"}.`,
        revealPath: desktop ? lastPath : undefined,
        error: written === 0,
      });
    } catch (e) {
      setNotice({ text: `Export fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`, error: true });
    } finally {
      setExporting(false);
    }
  };

  const chooseOutputDir = async () => {
    const dir = await pickFolder();
    if (dir) {
      setOutputDir(dir);
      saveOutputDir(dir);
    }
  };

  const resetOutputDir = () => {
    setOutputDir(null);
    saveOutputDir(null);
  };

  /* ---------- Darstellung ---------- */

  const editingImage = editing ? images.find((i) => i.id === editing.imageId) : undefined;
  const editingVariant = editingImage?.variants.find((v) => v.id === editing?.variantId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const outputLabel = useMemo(
    () => (!desktop ? "Downloads" : outputDir ? baseName(outputDir) : "Neben dem Original"),
    [desktop, outputDir],
  );

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          Shrinkr
        </div>
        <div className="toolbar-spacer" />
        {desktop && (
          <div className="output">
            <button className="btn ghost" onClick={chooseOutputDir} type="button" title={outputDir ?? "Dateien neben dem Original speichern"}>
              <Icon name="folder" size={15} /> Ausgabe: {outputLabel}
            </button>
            {outputDir && (
              <button className="icon-btn small" onClick={resetOutputDir} type="button" aria-label="Wieder neben dem Original speichern">
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        )}
        <button className="btn ghost" onClick={chooseFiles} type="button">
          <Icon name="plus" size={15} /> Bilder hinzufügen
        </button>
        <button className="btn ghost danger-text" onClick={clearAll} disabled={images.length === 0} type="button">
          <Icon name="trash" size={15} /> Leeren
        </button>
        <button className="btn primary" onClick={() => exportImages(images)} disabled={exporting || anyBusy || readyCount === 0} type="button">
          <Icon name="export" size={15} /> {anyBusy ? "Berechne …" : `Alle exportieren (${readyCount})`}
        </button>
      </header>

      <div className="body">
        <Sidebar
          presets={presets}
          hasImages={images.some((i) => !i.error)}
          onApply={(p) => applyToAll(p)}
          onToggleAuto={(id) => updatePresets(presets.map((p) => (p.id === id ? { ...p, auto: !p.auto } : p)))}
          onDelete={(id) => updatePresets(presets.filter((p) => p.id !== id))}
        />

        <main className="main">
          {notice && (
            <div className={`notice ${notice.error ? "error" : ""}`} role="status">
              <span>{notice.text}</span>
              {notice.revealPath && (
                <button className="link" onClick={() => void revealInFinder(notice.revealPath as string)} type="button">
                  Im Finder zeigen
                </button>
              )}
              <button className="icon-btn small" onClick={() => setNotice(null)} type="button" aria-label="Hinweis schließen">
                <Icon name="close" size={14} />
              </button>
            </div>
          )}

          {images.length === 0 ? (
            <div className="empty">
              <Icon name="image" size={44} />
              <h1>Bilder hierher ziehen</h1>
              <p>
                Komprimieren, skalieren und in JPEG, PNG, WebP oder AVIF umwandeln – alles lokal, ohne Upload.
                {loading > 0 ? " Lade …" : ""}
              </p>
              <button className="btn primary" onClick={chooseFiles} type="button">
                Bilder auswählen
              </button>
              <span className="hint">Unterstützt: {ACCEPTED_EXTENSIONS.join(", ")}</span>
            </div>
          ) : (
            <div className="list">
              {images.map((img) => (
                <ImageCard
                  key={img.id}
                  image={img}
                  activeVariantId={editing?.imageId === img.id ? editing.variantId : null}
                  onRename={(name) => setImages((prev) => prev.map((i) => (i.id === img.id ? { ...i, name } : i)))}
                  onAddVariant={() => addVariant(img.id)}
                  onOpenVariant={(variantId) => setEditing({ imageId: img.id, variantId })}
                  onRemove={() => removeImage(img.id)}
                  onExport={() => exportImages([img])}
                  exportDisabled={exporting || img.variants.length === 0 || img.variants.some((v) => v.status === "pending" || v.status === "working")}
                />
              ))}
              {loading > 0 && <div className="loading">Lade {loading} {loading === 1 ? "Bild" : "Bilder"} …</div>}
            </div>
          )}

          {images.length > 0 && (
            <footer className="statusbar">
              {images.length} {images.length === 1 ? "Bild" : "Bilder"} · {readyCount} {readyCount === 1 ? "Datei" : "Dateien"} bereit
              {readyCount > 0 && <> · Export gesamt {formatBytes(totalBytes)}</>}
            </footer>
          )}
        </main>

        {editingImage && editingVariant && (
          <VariantPanel
            key={editingVariant.id}
            image={editingImage}
            variant={editingVariant}
            onChange={(s) => changeSettings(editingImage.id, editingVariant.id, s)}
            onSuffix={(suffix) =>
              setImages((prev) => mapVariant(prev, editingImage.id, editingVariant.id, (v) => ({ ...v, suffix })))
            }
            onDelete={() => deleteVariant(editingImage.id, editingVariant.id)}
            onClose={() => setEditing(null)}
            onApplyToAll={() => applyToAll(editingVariant.settings)}
            onSavePreset={() => savePreset(editingVariant.settings)}
          />
        )}
      </div>

      {hover && (
        <div className="drop-overlay">
          <Icon name="image" size={48} />
          <span>Zum Hinzufügen loslassen</span>
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(",")}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void addFromFileList(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function mapVariant(images: SourceImage[], imageId: string, variantId: string, fn: (v: Variant) => Variant): SourceImage[] {
  return images.map((i) =>
    i.id === imageId ? { ...i, variants: i.variants.map((v) => (v.id === variantId ? fn(v) : v)) } : i,
  );
}
