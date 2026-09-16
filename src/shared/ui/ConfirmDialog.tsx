import { Modal } from "./Modal";

export function ConfirmDialog({
  message,
  confirmLabel = "Delete",
  onCancel,
  onConfirm,
  title
}: { confirmLabel?: string; message: string; onCancel: () => void; onConfirm: () => void; title: string }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p>{message}</p>
      <div className="modal-actions">
        <button className="secondary-button" onClick={onCancel}>Cancel</button>
        <button className="primary-button danger" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}
