import { useState, type ChangeEvent } from 'react';
import { hardResetSave, importSave, saveGame, useGameStore } from '../state/persistStore';
import { useSettings } from '../state/settings';

interface SettingsScreenProps {
  onClose: () => void;
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString();
}

/**
 * UI_SPEC §6: "Accessed from a gear icon in the ticker." Contains save export/import
 * (string + file), manual save + last-saved timestamp, hard reset (double confirm),
 * sound/motion toggles. Telemetry opt-in and number notation are UI_SPEC's own extra
 * detail in this section but aren't in SPRINTS.md Sprint 8's explicit task-4 list —
 * telemetry is separately marked "(Sprint 12)" in the doc itself, and number notation
 * has no defined alternate format anywhere in ECONOMY_MODEL §12 to build against
 * (rule 1: don't invent a display spec that isn't written down) — both left out of this
 * pass, flagged in PROGRESS.md rather than silently built or silently skipped.
 */
export function SettingsScreen({ onClose }: SettingsScreenProps) {
  const lastSeenAt = useGameStore((s) => s.lastSeenAt);
  const soundEnabled = useSettings((s) => s.soundEnabled);
  const setSoundEnabled = useSettings((s) => s.setSoundEnabled);
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const setReducedMotion = useSettings((s) => s.setReducedMotion);

  const [exportText, setExportText] = useState('');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  function currentSaveJson(): string {
    // useGameStore.getState() returns the whole store (data + action functions) —
    // JSON.stringify silently drops function-valued properties, so this serializes
    // exactly the GameState fields, same as saveGame()'s own localStorage write.
    return JSON.stringify(useGameStore.getState());
  }

  function handleManualSave() {
    saveGame(useGameStore.getState());
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  }

  function handleExportString() {
    setExportText(currentSaveJson());
  }

  function handleDownloadFile() {
    const blob = new Blob([currentSaveJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aurora-program-save-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function runImport(raw: string) {
    const result = importSave(raw);
    // On success, importSave() reloads the page itself — nothing left to do here.
    if (!result.ok) setImportError(result.error ?? 'Import failed.');
  }

  function handleImportText() {
    runImport(importText);
  }

  function handleFileChosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => runImport(String(reader.result ?? ''));
    reader.readAsText(file);
  }

  function handleResetClick() {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    hardResetSave();
  }

  return (
    <div className="settings-backdrop">
      <div className="settings-screen" role="dialog" aria-label="Settings">
        <div className="settings-screen__header">
          <h2>Settings</h2>
          <button type="button" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>

        <section className="settings-section">
          <h3>Save</h3>
          <div className="settings-row">
            <button type="button" onClick={handleManualSave}>
              Save now
            </button>
            <span className="settings-hint">
              {justSaved ? 'Saved!' : `Last saved: ${formatTimestamp(lastSeenAt)}`}
            </span>
          </div>
        </section>

        <section className="settings-section">
          <h3>Export save</h3>
          <div className="settings-row">
            <button type="button" onClick={handleExportString}>
              Show as text
            </button>
            <button type="button" onClick={handleDownloadFile}>
              Download file
            </button>
          </div>
          {exportText && (
            <textarea
              className="settings-textarea"
              readOnly
              value={exportText}
              aria-label="Save export text"
              onFocus={(e) => e.currentTarget.select()}
            />
          )}
        </section>

        <section className="settings-section">
          <h3>Import save</h3>
          <p className="settings-note">Importing replaces your current save. This can&apos;t be undone.</p>
          <textarea
            className="settings-textarea"
            placeholder="Paste a save string here"
            aria-label="Save import text"
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value);
              setImportError(null);
            }}
          />
          <div className="settings-row">
            <button type="button" disabled={!importText.trim()} onClick={handleImportText}>
              Import from text
            </button>
            <label className="settings-file-label">
              Import from file
              <input
                type="file"
                accept=".json,application/json"
                className="settings-file-input"
                onChange={handleFileChosen}
              />
            </label>
          </div>
          {importError && <p className="settings-error">{importError}</p>}
        </section>

        <section className="settings-section">
          <h3>Preferences</h3>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => setSoundEnabled(e.target.checked)}
            />
            Sound
          </label>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(e) => setReducedMotion(e.target.checked)}
            />
            Reduced motion
          </label>
        </section>

        <section className="settings-section settings-section--danger">
          <h3>Hard reset</h3>
          <p className="settings-note">Wipes your save completely. This can&apos;t be undone.</p>
          {confirmingReset ? (
            <div className="settings-row">
              <span className="settings-error">Are you sure? This deletes everything.</span>
              <button type="button" className="settings-danger-button" onClick={handleResetClick}>
                Yes, reset
              </button>
              <button type="button" onClick={() => setConfirmingReset(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="settings-danger-button" onClick={handleResetClick}>
              Reset save
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
