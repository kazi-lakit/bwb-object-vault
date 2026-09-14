import { useRef, useState } from "react";
import { CheckCircle2, Upload, XCircle } from "lucide-react";
import { uploadFile } from "../vaultApi";
import { ActionButton } from "../../../shared/ui/ActionButton";

type UploadTask = { error?: string; id: string; name: string; status: "done" | "error" | "uploading" };

export function UploadButton({
  disabled,
  parentDirectoryId,
  onUploaded
}: {
  disabled?: boolean;
  parentDirectoryId: string | undefined;
  onUploaded: (fileId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [tasks, setTasks] = useState<UploadTask[]>([]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || !parentDirectoryId) return;
    const files = Array.from(fileList);
    const newTasks: UploadTask[] = files.map((file) => ({ id: `${file.name}-${crypto.randomUUID()}`, name: file.name, status: "uploading" }));
    setTasks((current) => [...current, ...newTasks]);

    await Promise.all(
      files.map(async (file, index) => {
        const taskId = newTasks[index]!.id;
        try {
          const { fileId } = await uploadFile({ file, parentDirectoryId });
          setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, status: "done" } : task)));
          onUploaded(fileId);
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "Upload failed.";
          setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, error: message, status: "error" } : task)));
        }
      })
    );
  }

  function dismiss(taskId: string) {
    setTasks((current) => current.filter((task) => task.id !== taskId));
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          void handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <ActionButton icon={<Upload size={18} />} disabled={disabled} onClick={() => inputRef.current?.click()}>
        Upload
      </ActionButton>

      {tasks.length > 0 ? (
        <div className="upload-tray">
          {tasks.map((task) => (
            <div key={task.id} className={`upload-task upload-task-${task.status}`}>
              {task.status === "done" ? <CheckCircle2 size={16} /> : task.status === "error" ? <XCircle size={16} /> : <span className="spinner spinner-sm" />}
              <div className="upload-task-body">
                <span className="upload-task-name">{task.name}</span>
                {task.error ? <span className="upload-task-error">{task.error}</span> : null}
              </div>
              {task.status !== "uploading" ? (
                <button className="icon-button" aria-label="Dismiss" onClick={() => dismiss(task.id)}>
                  <XCircle size={14} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
