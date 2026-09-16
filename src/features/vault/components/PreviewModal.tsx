import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Modal } from "../../../shared/ui/Modal";
import { ErrorState } from "../../../shared/ui/ErrorState";
import { getFileDownloadUrl } from "../vaultApi";
import { isPreviewable } from "../format";
import type { VaultObject } from "../types";

export function PreviewModal({ object, onClose }: { object: VaultObject; onClose: () => void }) {
  const kind = isPreviewable(object);
  const urlQuery = useQuery({
    queryFn: () => getFileDownloadUrl(object.itemId),
    queryKey: ["vault", "file-url", object.itemId]
  });

  return (
    <Modal title={object.name} onClose={onClose}>
      <div className="preview-body">
        {urlQuery.isLoading ? <p className="muted">Loading preview...</p> : null}
        {urlQuery.isError ? <ErrorState message={urlQuery.error instanceof Error ? urlQuery.error.message : "Could not load this file."} onRetry={() => urlQuery.refetch()} /> : null}
        {urlQuery.data && kind === "image" ? <img src={urlQuery.data} alt={object.name} className="preview-image" /> : null}
        {urlQuery.data && kind === "pdf" ? <iframe src={urlQuery.data} title={object.name} className="preview-pdf" /> : null}
        {urlQuery.data && kind === "video" ? <video src={urlQuery.data} controls className="preview-video"><track kind="captions" /></video> : null}
        {urlQuery.data && kind === "audio" ? <audio src={urlQuery.data} controls className="preview-audio" /> : null}
        {urlQuery.data ? (
          <a className="primary-button preview-download" href={urlQuery.data} target="_blank" rel="noreferrer">
            <Download size={16} /> Download
          </a>
        ) : null}
      </div>
    </Modal>
  );
}
