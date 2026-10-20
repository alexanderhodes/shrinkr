import { Icon } from "./Icon";
import { formatBytes, formatDelta, formatDimensions, labelFor } from "../lib/format";
import type { SourceImage, Variant } from "../lib/types";

interface Props {
  image: SourceImage;
  activeVariantId: string | null;
  onRename: (name: string) => void;
  onAddVariant: () => void;
  onOpenVariant: (variantId: string) => void;
  onRemove: () => void;
  onExport: () => void;
  exportDisabled: boolean;
}

function VariantCard({
  image,
  variant,
  active,
  onClick,
}: {
  image: SourceImage;
  variant: Variant;
  active: boolean;
  onClick: () => void;
}) {
  const s = variant.settings;
  const r = variant.result;
  const busy = variant.status === "pending" || variant.status === "working";
  const delta = r ? formatDelta(image.size, r.size) : null;
  return (
    <button className={`variant ${active ? "active" : ""} ${variant.status}`} onClick={onClick} type="button">
      <span className="variant-title">
        <span className={`badge fmt-${s.format}`}>{labelFor(s.format)}</span>
        {formatDimensions(s.width, s.height)}
      </span>
      <span className="variant-meta">
        {variant.status === "error" ? (
          <span className="err" title={variant.error}>
            Fehler
          </span>
        ) : (
          <>
            <span className="meta-item">
              <Icon name="dims" size={14} />
              {r ? `${r.width}×${r.height}` : "…"}
            </span>
            <span className="meta-item">
              <Icon name="weight" size={14} />
              {r ? formatBytes(r.size) : "…"}
            </span>
            {delta && !busy && <span className={`delta ${delta.better ? "good" : "bad"}`}>{delta.text}</span>}
            {busy && <span className="spinner" aria-label="wird berechnet" />}
          </>
        )}
      </span>
    </button>
  );
}

export function ImageCard({
  image,
  activeVariantId,
  onRename,
  onAddVariant,
  onOpenVariant,
  onRemove,
  onExport,
  exportDisabled,
}: Props) {
  return (
    <section className="card">
      <div className="card-source">
        <div className="thumb">
          <img src={image.thumbUrl} alt="" draggable={false} />
        </div>
        <div className="source-meta">
          <span className="meta-item">
            <Icon name="file" />
            {image.formatLabel}
          </span>
          <span className="meta-item">
            <Icon name="dims" />
            {image.width}×{image.height}
          </span>
          <span className="meta-item">
            <Icon name="weight" />
            {formatBytes(image.size)}
          </span>
        </div>
      </div>

      <div className="card-main">
        <div className="card-head">
          <label className="field name-field">
            <input
              value={image.name}
              onChange={(e) => onRename(e.target.value)}
              spellCheck={false}
              aria-label="Dateiname"
            />
            <span className="field-label">Name</span>
          </label>
          <div className="card-actions">
            <button className="btn ghost small" onClick={onExport} disabled={exportDisabled} type="button">
              <Icon name="export" size={14} /> Exportieren
            </button>
            <button className="btn ghost small danger-text" onClick={onRemove} type="button" title="Bild entfernen">
              <Icon name="trash" size={14} />
            </button>
          </div>
        </div>

        {image.error ? (
          <p className="error-note">{image.error}</p>
        ) : (
          <div className="variants">
            {image.variants.map((v) => (
              <VariantCard
                key={v.id}
                image={image}
                variant={v}
                active={v.id === activeVariantId}
                onClick={() => onOpenVariant(v.id)}
              />
            ))}
            <button className="variant add" onClick={onAddVariant} type="button">
              <Icon name="plus" size={18} />
              <span>Variante</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
