import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveOrganization } from "../organizations/ActiveOrganizationProvider";
import { PageHeader } from "../../shared/ui/PageHeader";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState } from "../../shared/ui/ErrorState";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { LoadingScreen } from "../../shared/ui/LoadingScreen";
import { useVaultAnchor } from "./useVaultAnchor";
import { useDirectoryListing } from "./useDirectoryListing";
import { deleteObject, getFileDownloadUrl } from "./vaultApi";
import { resourceTypeOf, type PathEntry, type VaultObject } from "./types";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { VaultObjectList } from "./components/VaultObjectList";
import { ShareDialog } from "./components/ShareDialog";
import { PreviewModal } from "./components/PreviewModal";

const SYSTEM_ROOT: PathEntry = { id: undefined, name: "System Files" };

// Browses the shared "Cloud" root directly, rather than a personal drive
// folder under it (see VaultPage) -- so this is where anything that lives
// alongside everyone's personal folders shows up. Storage's get-objects
// already filters to what the caller can see, so no extra ownership/access
// filtering is needed here: a user only ever gets back items they created
// or were granted access to.
export function SystemFilesPage() {
  const { activeOrgId } = useActiveOrganization();
  const anchor = useVaultAnchor();
  const [path, setPath] = useState<PathEntry[]>([SYSTEM_ROOT]);
  const [previewing, setPreviewing] = useState<VaultObject>();
  const [sharing, setSharing] = useState<VaultObject>();
  const [deleting, setDeleting] = useState<VaultObject>();
  const queryClient = useQueryClient();

  useEffect(() => {
    setPath([SYSTEM_ROOT]);
  }, [activeOrgId]);

  const atRoot = path.length === 1;
  const currentDirectoryId = atRoot ? anchor.data?.itemId : path[path.length - 1]!.id;
  const listing = useDirectoryListing(currentDirectoryId, "");

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["vault", "objects", currentDirectoryId] });
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

  if (anchor.isLoading) return <LoadingScreen />;
  if (anchor.isError) {
    return (
      <ErrorState
        message={anchor.error instanceof Error ? anchor.error.message : "Could not load system files."}
        onRetry={() => anchor.refetch()}
      />
    );
  }

  return (
    <section>
      <PageHeader title="System Files" subtitle="Folders and files you created or have access to." />

      {!atRoot ? <Breadcrumbs path={path} onNavigate={(index) => setPath((current) => current.slice(0, index + 1))} /> : null}

      {listing.isLoading ? <LoadingScreen /> : null}
      {listing.isError ? (
        <ErrorState message={listing.error instanceof Error ? listing.error.message : "Could not load items."} onRetry={() => listing.refetch()} />
      ) : null}
      {!listing.isLoading && !listing.isError && listing.items.length === 0 ? (
        <EmptyState title="Nothing here" description="Folders and files you created or have access to will show up here." />
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
