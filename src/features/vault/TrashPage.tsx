import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { PageHeader } from "../../shared/ui/PageHeader";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState } from "../../shared/ui/ErrorState";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { GridSkeleton, ListSkeleton } from "../../shared/ui/ListSkeleton";
import { ViewToggle } from "../../shared/ui/ViewToggle";
import { useToast } from "../../shared/ui/toast";
import { useTrash } from "./useDirectoryListing";
import { useViewMode } from "./useViewMode";
import { getFileDownloadUrl, purgeObject, restoreObject } from "./vaultApi";
import type { VaultObject } from "./types";
import { VaultObjectGrid } from "./components/VaultObjectGrid";
import { VaultObjectList } from "./components/VaultObjectList";
import { PreviewModal } from "./components/PreviewModal";
import { VersionHistoryDialog } from "./components/VersionHistoryDialog";

export function TrashPage() {
  const listing = useTrash();
  const [viewMode, setViewMode] = useViewMode();
  const [previewing, setPreviewing] = useState<VaultObject>();
  const [versions, setVersions] = useState<VaultObject>();
  const [purging, setPurging] = useState<VaultObject>();
  const queryClient = useQueryClient();
  const toast = useToast();

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["vault", "trash"] });
    void queryClient.invalidateQueries({ queryKey: ["vault", "objects"] });
  }

  async function download(item: VaultObject) {
    try {
      const url = await getFileDownloadUrl(item.itemId);
      window.open(url, "_blank", "noreferrer");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : `Could not download "${item.name}".`);
    }
  }

  async function restore(item: VaultObject) {
    try {
      await restoreObject(item.itemId);
      invalidate();
      toast.success(`"${item.name}" restored.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : `Could not restore "${item.name}".`);
    }
  }

  async function purge() {
    if (!purging) return;
    const name = purging.name;
    try {
      await purgeObject(purging.itemId);
      setPurging(undefined);
      invalidate();
      toast.success(`"${name}" permanently deleted.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : `Could not permanently delete "${name}".`);
    }
  }

  const view = viewMode === "grid" ? (
    <VaultObjectGrid
      items={listing.items}
      onOpen={() => undefined}
      onPreview={setPreviewing}
      onDownload={download}
      onVersions={setVersions}
      onRestore={(item) => void restore(item)}
      onPurge={setPurging}
    />
  ) : (
    <VaultObjectList
      items={listing.items}
      onOpen={() => undefined}
      onPreview={setPreviewing}
      onDownload={download}
      onVersions={setVersions}
      onRestore={(item) => void restore(item)}
      onPurge={setPurging}
    />
  );

  return (
    <section>
      <PageHeader icon={<Trash2 size={20} />} title="Trash" subtitle="Restore items or permanently delete them." />
      <div className="toolbar"><span /><ViewToggle value={viewMode} onChange={setViewMode} /></div>
      {listing.isLoading ? (viewMode === "grid" ? <GridSkeleton /> : <ListSkeleton />) : null}
      {listing.isError ? <ErrorState message={listing.error instanceof Error ? listing.error.message : "Could not load trash."} onRetry={() => listing.refetch()} /> : null}
      {!listing.isLoading && !listing.isError && listing.items.length === 0 ? (
        <EmptyState icon={<Trash2 size={26} />} title="Trash is empty" description="Deleted files and folders will appear here." />
      ) : null}
      {listing.items.length > 0 ? view : null}
      {listing.hasNextPage ? (
        <div className="pagination"><span /><button className="link-button" onClick={() => listing.fetchNextPage()} disabled={listing.isFetchingNextPage}>{listing.isFetchingNextPage ? "Loading..." : "Load more"}</button></div>
      ) : null}
      {previewing ? <PreviewModal object={previewing} onClose={() => setPreviewing(undefined)} /> : null}
      {versions ? <VersionHistoryDialog object={versions} onClose={() => setVersions(undefined)} /> : null}
      {purging ? (
        <ConfirmDialog
          title={`Permanently delete "${purging.name}"?`}
          message="This cannot be undone."
          confirmLabel="Delete forever"
          onCancel={() => setPurging(undefined)}
          onConfirm={() => void purge()}
        />
      ) : null}
    </section>
  );
}
