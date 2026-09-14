import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveOrganization } from "../organizations/ActiveOrganizationProvider";
import { PageHeader } from "../../shared/ui/PageHeader";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState } from "../../shared/ui/ErrorState";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { LoadingScreen } from "../../shared/ui/LoadingScreen";
import { useDirectoryListing, useSharedWithMe } from "./useDirectoryListing";
import { deleteObject, getFileDownloadUrl } from "./vaultApi";
import { resourceTypeOf, type PathEntry, type VaultObject } from "./types";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { VaultObjectList } from "./components/VaultObjectList";
import { ShareDialog } from "./components/ShareDialog";
import { PreviewModal } from "./components/PreviewModal";

const SHARED_ROOT: PathEntry = { id: undefined, name: "Shared with me" };

export function SharedPage() {
  const { activeOrgId } = useActiveOrganization();
  const [path, setPath] = useState<PathEntry[]>([SHARED_ROOT]);
  const [previewing, setPreviewing] = useState<VaultObject>();
  const [sharing, setSharing] = useState<VaultObject>();
  const [deleting, setDeleting] = useState<VaultObject>();
  const queryClient = useQueryClient();

  useEffect(() => {
    setPath([SHARED_ROOT]);
  }, [activeOrgId]);

  const atRoot = path.length === 1;
  const currentDirectoryId = atRoot ? undefined : path[path.length - 1]!.id;

  const shared = useSharedWithMe();
  const nested = useDirectoryListing(currentDirectoryId, "");
  const listing = atRoot ? shared : nested;

  function invalidate() {
    if (atRoot) void queryClient.invalidateQueries({ queryKey: ["vault", "shared"] });
    else void queryClient.invalidateQueries({ queryKey: ["vault", "objects", currentDirectoryId] });
  }

  function openFolder(item: VaultObject) {
    setPath((current) => [...current, { id: item.itemId, name: item.name }]);
  }

  async function handleDownload(item: VaultObject) {
    const url = await getFileDownloadUrl(item.itemId);
    window.open(url, "_blank", "noreferrer");
  }

  async function handleDelete() {
    if (!deleting) return;
    await deleteObject({ permanent: false, resourceId: deleting.itemId, resourceType: resourceTypeOf(deleting) });
    setDeleting(undefined);
    invalidate();
  }

  return (
    <section>
      <PageHeader title="Shared with me" subtitle="Files and folders other people or organizations shared with you." />

      {!atRoot ? <Breadcrumbs path={path} onNavigate={(index) => setPath((current) => current.slice(0, index + 1))} /> : null}

      {listing.isLoading ? <LoadingScreen /> : null}
      {listing.isError ? (
        <ErrorState message={listing.error instanceof Error ? listing.error.message : "Could not load shared items."} onRetry={() => listing.refetch()} />
      ) : null}
      {!listing.isLoading && !listing.isError && listing.items.length === 0 ? (
        <EmptyState title="Nothing shared yet" description="Items other people share with you, your role, or your organization will show up here." />
      ) : null}
      {listing.items.length > 0 ? (
        <VaultObjectList
          items={listing.items}
          onOpen={openFolder}
          onPreview={setPreviewing}
          onDownload={handleDownload}
          onShare={setSharing}
          onDelete={setDeleting}
        />
      ) : null}
      {listing.hasNextPage ? (
        <div className="pagination">
          <span />
          <button className="link-button" onClick={() => listing.fetchNextPage()} disabled={listing.isFetchingNextPage}>
            {listing.isFetchingNextPage ? "Loading..." : "Load more"}
          </button>
        </div>
      ) : null}

      {previewing ? <PreviewModal object={previewing} onClose={() => setPreviewing(undefined)} /> : null}
      {sharing ? <ShareDialog object={sharing} onClose={() => setSharing(undefined)} /> : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete "${deleting.name}"?`}
          message={deleting.type === "directory" ? "This moves the folder and its contents to trash." : "This moves the file to trash."}
          onCancel={() => setDeleting(undefined)}
          onConfirm={() => void handleDelete()}
        />
      ) : null}
    </section>
  );
}
