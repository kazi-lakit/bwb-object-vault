import { useEffect, useRef, useState, type FormEvent } from "react";
import { Modal } from "../../../shared/ui/Modal";
import { FormField } from "../../../shared/ui/FormField";
import type { VaultObject } from "../types";

export function RenameDialog({ object, onClose, onRename }: {
  object: VaultObject;
  onClose: () => void;
  onRename: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(object.name);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    if (object.type === "directory") input.select();
    else {
      const dot = object.name.lastIndexOf(".");
      input.setSelectionRange(0, dot > 0 ? dot : object.name.length);
    }
  }, [object]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === object.name) return onClose();
    setIsSaving(true);
    setError(undefined);
    try {
      await onRename(trimmed);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not rename this item.");
      setIsSaving(false);
    }
  }

  return (
    <Modal title={`Rename ${object.type === "directory" ? "folder" : "file"}`} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <FormField ref={inputRef} label="Name" value={name} onChange={(event) => setName(event.target.value)} autoFocus required />
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={isSaving}>Cancel</button>
          <button className="primary-button" type="submit" disabled={isSaving || !name.trim()}>{isSaving ? "Renaming..." : "Rename"}</button>
        </div>
      </form>
    </Modal>
  );
}
