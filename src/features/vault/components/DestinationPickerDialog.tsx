import { useState } from "react";
import { Folder, FolderInput } from "lucide-react";
import { Modal } from "../../../shared/ui/Modal";
import { ErrorState } from "../../../shared/ui/ErrorState";
import { Breadcrumbs } from "./Breadcrumbs";
import { useDirectoryListing } from "../useDirectoryListing";
import type { PathEntry, VaultObject } from "../types";

export function DestinationPickerDialog({ object, mode, rootDirectoryId, rootName, onClose, onConfirm }: {
  object: VaultObject;
  mode: "move" | "copy";
  rootDirectoryId: string;
  rootName: string;
  onClose: () => void;
  onConfirm: (targetDirectoryId: string) => Promise<void>;
}) {
  const [path, setPath] = useState<PathEntry[]>([{ id: rootDirectoryId, name: rootName }]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();
  const currentDirectoryId = path[path.length - 1]!.id;
  const listing = useDirectoryListing(currentDirectoryId, "");
  const folders = listing.items.filter((item) => item.type === "directory" && item.itemId !== object.itemId);

  async function confirm() {
    if (!currentDirectoryId) return;
    setIsSaving(true);
    setError(undefined);
    try {
      await onConfirm(currentDirectoryId);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not ${mode} this item.`);
      setIsSaving(false);
    }
  }

  return (
    <Modal title={`${mode === "move" ? "Move" : "Copy"} “${object.name}”`} onClose={onClose}>
      <p>Choose a destination folder.</p>
      <Breadcrumbs path={path} onNavigate={(index) => setPath((current) => current.slice(0, index + 1))} />
      <div className="destination-list">
        {listing.isLoading ? <p className="muted">Loading folders...</p> : null}
        {listing.isError ? <ErrorState message="Could not load folders." onRetry={() => listing.refetch()} /> : null}
        {!listing.isLoading && !listing.isError && folders.length === 0 ? <p className="muted destination-empty">No subfolders here.</p> : null}
        {folders.map((folder) => (
          <button key={folder.itemId} className="destination-entry" onClick={() => setPath((current) => [...current, { id: folder.itemId, name: folder.name }])}>
            <Folder size={16} /> <span>{folder.name}</span>
          </button>
        ))}
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose} disabled={isSaving}>Cancel</button>
        <button className="primary-button" onClick={() => void confirm()} disabled={isSaving || !currentDirectoryId}>
          <FolderInput size={16} /> {isSaving ? `${mode === "move" ? "Moving" : "Copying"}...` : `${mode === "move" ? "Move" : "Copy"} here`}
        </button>
      </div>
    </Modal>
  );
}
