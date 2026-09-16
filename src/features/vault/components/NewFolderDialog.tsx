import { useState } from "react";
import { Modal } from "../../../shared/ui/Modal";
import { FormField } from "../../../shared/ui/FormField";
import { Alert } from "../../../shared/ui/Alert";
import type { ObjectAccessLevel } from "../vaultApi";

const ACCESS_OPTIONS: Array<{ description: string; label: string; value: ObjectAccessLevel }> = [
  { value: "Creator", label: "Creator", description: "Only you can access this folder until you share it." },
  { value: "Organization", label: "Organization", description: "People in your active organization can access it by default." }
];

export function NewFolderDialog({
  onClose,
  onCreate
}: {
  onClose: () => void;
  onCreate: (name: string, objectAccessLevel: ObjectAccessLevel) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [objectAccessLevel, setObjectAccessLevel] = useState<ObjectAccessLevel>("Creator");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      await onCreate(name.trim(), objectAccessLevel);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the folder.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="New folder" onClose={onClose}>
      <form onSubmit={handleSubmit} className="modal-form">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <FormField
          label="Folder name"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Untitled folder"
        />
        <div className="upload-choice">
          <span>General access</span>
          <div className="upload-choice-buttons">
            {ACCESS_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.value}
                className={option.value === objectAccessLevel ? "active" : ""}
                onClick={() => setObjectAccessLevel(option.value)}
                disabled={submitting}
              >
                {option.label}
              </button>
            ))}
          </div>
          <small>{ACCESS_OPTIONS.find((option) => option.value === objectAccessLevel)!.description}</small>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button" disabled={submitting || !name.trim()}>
            {submitting ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
