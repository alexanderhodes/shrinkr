import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { formatBytes, formatDelta } from "../lib/format";
import { FORMATS, type FitMode, type Format, type SourceImage, type Variant, type VariantSettings } from "../lib/types";

interface Props {
  image: SourceImage;
  variant: Variant;
  onChange: (settings: VariantSettings) => void;
  onSuffix: (suffix: string) => void;
  onDelete: () => void;
  onClose: () => void;
  onApplyToAll: () => void;
  onSavePreset: () => void;
}

function clampInt(value: string, min: number, max: number): number | null {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || value.trim() === "") return null;
  return Math.min(max, Math.max(min, n));
}

export function VariantPanel({ image, variant, onChange, onSuffix, onDelete, onClose, onApplyToAll, onSavePreset }: Props) {
  // Lokaler Entwurf: Änderungen werden kurz verzögert übernommen, damit beim Ziehen des Reglers nicht jeder Zwischenwert berechnet wird.
  const [draft, setDraft] = useState<VariantSettings>(variant.settings);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => onChange(draft), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const result = variant.result;
  useEffect(() => {
    if (!result) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(result.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result]);

  const patch = (p: Partial<VariantSettings>) => setDraft((d) => ({ ...d, ...p }));
  const busy = variant.status === "pending" || variant.status === "working";
  const delta = result ? formatDelta(image.size, result.size) : null;
  const bothSet = draft.width !== null && draft.height !== null;

  return (
    <aside className="panel" aria-label="Variante bearbeiten">
      <div className="panel-head">
        <h2>Variante</h2>
        <button className="icon-btn" onClick={onClose} type="button" aria-label="Schließen">
          <Icon name="close" />
        </button>
      </div>

      <div className="panel-body">
        <div className="size-row">
          <label className="field">
            <input
              type="number"
              min={1}
              max={16000}
              disabled={draft.width === null}
              value={draft.width ?? ""}
              placeholder="auto"
              onChange={(e) => patch({ width: clampInt(e.target.value, 1, 16000) })}
            />
            <span className="field-label">Breite</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.width === null}
              onChange={(e) => patch({ width: e.target.checked ? null : image.width })}
            />
            Auto
          </label>
        </div>

        <div className="size-row">
          <label className="field">
            <input
              type="number"
              min={1}
              max={16000}
              disabled={draft.height === null}
              value={draft.height ?? ""}
              placeholder="auto"
              onChange={(e) => patch({ height: clampInt(e.target.value, 1, 16000) })}
            />
            <span className="field-label">Höhe</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.height === null}
              onChange={(e) => patch({ height: e.target.checked ? null : image.height })}
            />
            Auto
          </label>
        </div>

        {bothSet && (
          <label className="field select-field">
            <select value={draft.fit} onChange={(e) => patch({ fit: e.target.value as FitMode })}>
              <option value="cover">Zuschneiden (mittig, füllt die Fläche)</option>
              <option value="contain">Einpassen (ganzes Bild, kein Zuschnitt)</option>
            </select>
            <span className="field-label">Bei fester Breite und Höhe</span>
          </label>
        )}

        <div className="field">
          <div className="segmented" role="radiogroup" aria-label="Format">
            {FORMATS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={draft.format === f.value}
                className={draft.format === f.value ? "on" : ""}
                onClick={() => patch({ format: f.value as Format })}
              >
                {f.label}
              </button>
            ))}
          </div>
          <span className="field-label">Format</span>
        </div>

        <div className="field quality">
          <div className="quality-head">
            <span>{draft.format === "png" ? "Verlustfrei" : draft.quality}</span>
            <span className="field-label inline">Qualität</span>
          </div>
          <input
            type="range"
            min={1}
            max={100}
            value={draft.quality}
            disabled={draft.format === "png"}
            onChange={(e) => patch({ quality: Number(e.target.value) })}
          />
          {draft.format === "png" && <p className="hint">PNG wird verlustfrei optimiert, hier gibt es keinen Qualitätsregler.</p>}
        </div>

        <label className="field">
          <input
            value={variant.suffix}
            onChange={(e) => onSuffix(e.target.value)}
            placeholder="automatisch: -BREITExHÖHE"
            spellCheck={false}
          />
          <span className="field-label">Dateiname-Zusatz (optional)</span>
        </label>

        <div className="result-box">
          <div className="preview">
            {previewUrl ? <img src={previewUrl} alt="Vorschau des Ergebnisses" /> : <span className="spinner big" />}
          </div>
          <div className="result-line">
            {variant.status === "error" ? (
              <span className="err">{variant.error ?? "Fehler bei der Verarbeitung"}</span>
            ) : result ? (
              <>
                <strong>{formatBytes(result.size)}</strong>
                <span>
                  {result.width}×{result.height}
                </span>
                {delta && !busy && <span className={`delta ${delta.better ? "good" : "bad"}`}>{delta.text} gegenüber Original</span>}
                {busy && <span className="spinner" />}
              </>
            ) : (
              <span>wird berechnet …</span>
            )}
          </div>
        </div>

        <div className="panel-links">
          <button className="link" onClick={onSavePreset} type="button">
            <Icon name="star" size={14} /> Als Preset speichern
          </button>
          <button className="link" onClick={onApplyToAll} type="button">
            <Icon name="plus" size={14} /> Zu allen Bildern hinzufügen
          </button>
        </div>
      </div>

      <div className="panel-foot">
        <button className="btn danger" onClick={onDelete} type="button">
          Variante löschen
        </button>
        <button className="btn primary" onClick={onClose} type="button">
          Fertig
        </button>
      </div>
    </aside>
  );
}
