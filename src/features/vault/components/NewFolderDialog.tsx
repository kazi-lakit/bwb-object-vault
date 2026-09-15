import { useState } from "react";
import { Modal } from "../../../shared/ui/Modal";
import { FormField } from "../../../shared/ui/FormField";
import { Alert } from "../../../shared/ui/Alert";

export function NewFolderDialog({
  onClose,
  onCreate
}: {
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      await onCreate(name);
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
