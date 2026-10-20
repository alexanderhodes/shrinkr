import { Icon } from "./Icon";
import { describeSettings } from "../lib/format";
import type { Preset } from "../lib/types";

interface Props {
  presets: Preset[];
  hasImages: boolean;
  onApply: (preset: Preset) => void;
  onToggleAuto: (id: string) => void;
  onDelete: (id: string) => void;
}

export function Sidebar({ presets, hasImages, onApply, onToggleAuto, onDelete }: Props) {
  return (
    <nav className="sidebar" aria-label="Presets">
      <h2>Presets</h2>
      {presets.length === 0 && (
        <p className="hint">
          Noch keine Presets. Öffne eine Variante und wähle „Als Preset speichern“, dann steht sie hier jederzeit bereit.
        </p>
      )}
      <ul>
        {presets.map((p) => (
          <li key={p.id} className="preset">
            <div className="preset-title">{describeSettings(p)}</div>
            <div className="preset-actions">
              <label className="check small" title="Wird jedem neu hinzugefügten Bild automatisch als Variante hinzugefügt">
                <input type="checkbox" checked={p.auto} onChange={() => onToggleAuto(p.id)} />
                Automatisch
              </label>
              <button
                className="btn ghost small"
                onClick={() => onApply(p)}
                disabled={!hasImages}
                type="button"
                title="Zu allen Bildern hinzufügen"
              >
                <Icon name="plus" size={14} /> Alle
              </button>
              <button className="icon-btn small" onClick={() => onDelete(p.id)} type="button" aria-label="Preset löschen">
                <Icon name="trash" size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="hint">„Automatisch“ legt die Variante bei jedem neuen Bild von selbst an.</p>
    </nav>
  );
}
