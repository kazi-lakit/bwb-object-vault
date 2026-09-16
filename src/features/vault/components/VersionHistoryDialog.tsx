import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Download, History } from "lucide-react";
import { Modal } from "../../../shared/ui/Modal";
import { ErrorState } from "../../../shared/ui/ErrorState";
import { formatBytes, formatDate } from "../format";
import { getFileVersionDownloadUrl, listFileVersions, type VaultFileVersionsPage } from "../vaultApi";
import type { VaultObject } from "../types";

export function VersionHistoryDialog({ object, onClose }: { object: VaultObject; onClose: () => void }) {
  const [downloading, setDownloading] = useState<number>();
  const query = useInfiniteQuery<VaultFileVersionsPage, Error>({
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: undefined,
    queryFn: ({ pageParam }) => listFileVersions({ cursor: pageParam as string | undefined, fileId: object.itemId }),
    queryKey: ["vault", "versions", object.itemId]
  });
  const versions = query.data?.pages.flatMap((page) => page.items) ?? [];
  const currentVersion = object.currentVersion ?? versions[0]?.no;

  async function download(version: number) {
    setDownloading(version);
    try {
      const url = await getFileVersionDownloadUrl(object.itemId, version);
      window.open(url, "_blank", "noreferrer");
    } finally {
      setDownloading(undefined);
    }
  }

  return (
    <Modal title="Version history" onClose={onClose}>
      <p className="version-file-name"><History size={16} /> {object.name}</p>
      <div className="version-list">
        {query.isLoading ? <p className="muted">Loading versions...</p> : null}
        {query.isError ? <ErrorState message={query.error.message} onRetry={() => query.refetch()} /> : null}
        {!query.isLoading && !query.isError && versions.length === 0 ? <p className="muted destination-empty">No versions found.</p> : null}
        {versions.map((version) => (
          <div className="version-row" key={version.itemId}>
            <div>
              <strong>Version {version.no}</strong>
              {version.no === currentVersion ? <span className="version-current">Current</span> : null}
              <p>{formatBytes(version.sizeInBytes)} · {formatDate(version.createdDate)}{version.uploadedBy ? ` · ${version.uploadedBy}` : ""}</p>
            </div>
            <button className="icon-button" aria-label={`Download version ${version.no}`} disabled={downloading === version.no} onClick={() => void download(version.no)}>
              <Download size={16} />
            </button>
          </div>
        ))}
      </div>
      {query.hasNextPage ? <button className="link-button" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? "Loading..." : "Load more"}</button> : null}
      <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Close</button></div>
    </Modal>
  );
}
