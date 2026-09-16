import { useRef, useState } from "react";
import { FilePlus2, FileText, X } from "lucide-react";
import { Modal } from "../../../shared/ui/Modal";
import { formatBytes } from "../format";
import { uploadFile, type ObjectAccessLevel, type StorageAccessModifier } from "../vaultApi";

const GENERAL_ACCESS: Array<{ description: string; label: string; value: ObjectAccessLevel }> = [
  { value: "Creator", label: "Creator", description: "Only you can access these files until you share them." },
  { value: "Organization", label: "Organization", description: "People in your active organization can access them by default." }
];

const STORAGE_ACCESS: Array<{ description: string; label: string; value: StorageAccessModifier }> = [
  { value: "Private", label: "Private", description: "Downloads use signed, time-limited links." },
  { value: "Public", label: "Public", description: "Anyone with the file link may be able to access it." }
];

type UploadResult = { error?: string; file: File; status: "error" | "pending" | "uploading" };

export function UploadOptionsDialog({ initialFiles, onClose, onUploaded, parentDirectoryId }: {
  initialFiles: File[];
  onClose: () => void;
  onUploaded: () => void;
  parentDirectoryId: string;
}) {
  const [entries, setEntries] = useState<UploadResult[]>(initialFiles.map((file) => ({ file, status: "pending" })));
  const [objectAccessLevel, setObjectAccessLevel] = useState<ObjectAccessLevel>("Creator");
  const [accessModifier, setAccessModifier] = useState<StorageAccessModifier>("Private");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(files: File[]) {
    setEntries((current) => [...current, ...files.map((file): UploadResult => ({ file, status: "pending" }))]);
  }

  function removeFile(index: number) {
    setEntries((current) => current.filter((_, entryIndex) => entryIndex !== index));
  }

  async function uploadAll() {
    if (entries.length === 0) return;
    setUploading(true);
    const results = await Promise.all(entries.map(async (entry, index) => {
      setEntries((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, error: undefined, status: "uploading" } : item));
      try {
        await uploadFile({
          accessModifier,
          file: entry.file,
          objectAccessLevel,
          parentDirectoryId
        });
        return { ...entry, status: "pending" as const, success: true };
      } catch (cause) {
        return {
          ...entry,
          error: cause instanceof Error ? cause.message : "Upload failed.",
          status: "error" as const,
          success: false
        };
      }
    }));
    const failed = results.filter((result) => !result.success).map(({ file, error, status }) => ({ file, error, status }));
    setEntries(failed);
    setUploading(false);
    onUploaded();
    if (failed.length === 0) onClose();
  }

  return (
    <Modal title="Upload files" onClose={uploading ? () => undefined : onClose}>
      <button type="button" className="upload-picker" onClick={() => inputRef.current?.click()} disabled={uploading}>
        <FilePlus2 size={18} /> Choose files
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files) addFiles(Array.from(event.target.files));
          event.target.value = "";
        }}
      />

      {entries.length > 0 ? (
        <ul className="upload-file-list">
          {entries.map((entry, index) => (
            <li key={`${entry.file.name}-${entry.file.lastModified}-${index}`}>
              <FileText size={16} />
              <div className="upload-file-info">
                <span title={entry.file.name}>{entry.file.name}</span>
                <small className={entry.error ? "upload-file-error" : undefined}>{entry.status === "uploading" ? "Uploading..." : entry.error ?? formatBytes(entry.file.size)}</small>
              </div>
              {!uploading ? <button className="icon-button" onClick={() => removeFile(index)} aria-label={`Remove ${entry.file.name}`}><X size={14} /></button> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <UploadChoice
        label="General access"
        options={GENERAL_ACCESS}
        value={objectAccessLevel}
        onChange={setObjectAccessLevel}
        disabled={uploading}
      />
      <UploadChoice
        label="Storage access"
        options={STORAGE_ACCESS}
        value={accessModifier}
        onChange={setAccessModifier}
        disabled={uploading}
      />

      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose} disabled={uploading}>Cancel</button>
        <button className="primary-button" onClick={() => void uploadAll()} disabled={uploading || entries.length === 0}>
          {uploading ? "Uploading..." : `Upload${entries.length ? ` ${entries.length}` : ""}`}
        </button>
      </div>
    </Modal>
  );
}

function UploadChoice<T extends string>({ disabled, label, onChange, options, value }: {
  disabled: boolean;
  label: string;
  onChange: (value: T) => void;
  options: Array<{ description: string; label: string; value: T }>;
  value: T;
}) {
  const selected = options.find((option) => option.value === value)!;
  return (
    <div className="upload-choice">
      <span>{label}</span>
      <div className="upload-choice-buttons">
        {options.map((option) => (
          <button
            type="button"
            key={option.value}
            className={option.value === value ? "active" : ""}
            onClick={() => onChange(option.value)}
            disabled={disabled}
          >
            {option.label}
          </button>
        ))}
      </div>
      <small>{selected.description}</small>
    </div>
  );
}
