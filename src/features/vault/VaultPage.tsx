import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveOrganization } from "../organizations/ActiveOrganizationProvider";
import { FolderPlus, Search } from "lucide-react";
import { PageHeader } from "../../shared/ui/PageHeader";
import { ActionButton } from "../../shared/ui/ActionButton";
import { Alert } from "../../shared/ui/Alert";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState } from "../../shared/ui/ErrorState";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { LoadingScreen } from "../../shared/ui/LoadingScreen";
import { useCurrentUser } from "../profile/useCurrentUser";
import { useVaultRoot } from "./useVaultRoot";
import { useDirectoryListing } from "./useDirectoryListing";
import { createFolder, deleteObject, getFileDownloadUrl, makePrivate, uploadFile } from "./vaultApi";
import { resourceTypeOf, type PathEntry, type VaultObject, type VaultResourceType } from "./types";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { VaultObjectList } from "./components/VaultObjectList";
import { NewFolderDialog } from "./components/NewFolderDialog";
import { UploadButton } from "./components/UploadButton";
import { ShareDialog } from "./components/ShareDialog";
import { PreviewModal } from "./components/PreviewModal";

export function VaultPage() {
  const root = useVaultRoot();
  const { activeOrgId } = useActiveOrganization();
  const me = useCurrentUser();
  const [path, setPath] = useState<PathEntry[]>([]);
  const [search, setSearch] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [previewing, setPreviewing] = useState<VaultObject>();
  const [sharing, setSharing] = useState<VaultObject>();
  const [deleting, setDeleting] = useState<VaultObject>();
  const [isDragging, setIsDragging] = useState(false);
  const [warning, setWarning] = useState<string>();
  const queryClient = useQueryClient();

  // A folder deeper than the root belongs to a specific org's directory
  // tree -- after switching organizations it no longer resolves, so drop
  // back to "My Drive" rather than showing a 403/empty dead end.
  useEffect(() => {
    setPath([]);
    setSearch("");
    setWarning(undefined);
  }, [activeOrgId]);

  const currentDirectoryId = path.length > 0 ? path[path.length - 1]!.id : root.data?.itemId;
  const listing = useDirectoryListing(currentDirectoryId, search);
  const isAtRoot = Boolean(root.data) && currentDirectoryId === root.data?.itemId;

  function invalidateListing() {
    void queryClient.invalidateQueries({ queryKey: ["vault", "objects", currentDirectoryId] });
  }

  // Everything directly under the vault root inherits Cloud's project-wide
  // "Everyone: Edit" grant (needed so anyone can browse/create there at
  // all) unless cut loose right away -- a folder created deeper down
  // already inherits from an already-private parent, so only top-level
  // items need this.
  async function protectIfTopLevel(resourceId: string, resourceType: VaultResourceType) {
    if (!isAtRoot) return;
    const ownerId = me.data?.data?.itemId;
    if (!ownerId) {
      setWarning("Could not confirm your user id, so this item was left shared with everyone in the project. Refresh and try sharing/privacy actions again.");
      return;
    }
    try {
      await makePrivate({ ownerId, resourceId, resourceType });
    } catch (cause) {
      setWarning(cause instanceof Error ? cause.message : "Could not make this item private -- it may still be visible to everyone in the project.");
    }
  }

  function openFolder(item: VaultObject) {
    setSearch("");
    setPath((current) => [...current, { id: item.itemId, name: item.name }]);
  }

  function goToBreadcrumb(index: number) {
    setSearch("");
    setPath((current) => current.slice(0, index));
  }

  async function handleDownload(item: VaultObject) {
    const url = await getFileDownloadUrl(item.itemId);
    window.open(url, "_blank", "noreferrer");
  }

  async function handleDelete() {
    if (!deleting) return;
    await deleteObject({ permanent: false, resourceId: deleting.itemId, resourceType: resourceTypeOf(deleting) });
    setDeleting(undefined);
    invalidateListing();
  }

  async function uploadDroppedFiles(files: FileList) {
    if (!currentDirectoryId) return;
    const results = await Promise.allSettled(
      Array.from(files).map((file) => uploadFile({ file, parentDirectoryId: currentDirectoryId }))
    );
    for (const result of results) {
      if (result.status === "fulfilled") await protectIfTopLevel(result.value.fileId, "File");
    }
    invalidateListing();
  }

  if (root.isLoading) return <LoadingScreen />;
  if (root.isError) {
    return <ErrorState message={root.error instanceof Error ? root.error.message : "Could not open the drive."} onRetry={() => root.refetch()} />;
  }

  const breadcrumbPath: PathEntry[] = [{ id: root.data?.itemId, name: "My Drive" }, ...path];

  return (
    <section
      onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        if (event.dataTransfer.files.length > 0) void uploadDroppedFiles(event.dataTransfer.files);
      }}
    >
      <PageHeader
        title="My Drive"
        subtitle="Your personal files and folders."
        actions={
          <>
            <ActionButton variant="icon" icon={<FolderPlus size={18} />} onClick={() => setShowNewFolder(true)} title="New folder" />
            <UploadButton
              parentDirectoryId={currentDirectoryId}
              onUploaded={(fileId) => {
                void protectIfTopLevel(fileId, "File");
                invalidateListing();
              }}
            />
          </>
        }
      />

      {warning ? <Alert tone="warn">{warning}</Alert> : null}

      <div className="toolbar">
        <div className="search-box">
          <Search size={16} />
          <input
            placeholder="Search this drive"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {search.trim() ? null : <Breadcrumbs path={breadcrumbPath} onNavigate={goToBreadcrumb} />}

      <div className={isDragging ? "vault-dropzone vault-dropzone-active" : "vault-dropzone"}>
        {listing.isLoading ? <LoadingScreen /> : null}
        {listing.isError ? (
          <ErrorState message={listing.error instanceof Error ? listing.error.message : "Could not load this folder."} onRetry={() => listing.refetch()} />
        ) : null}
        {!listing.isLoading && !listing.isError && listing.items.length === 0 ? (
          <EmptyState
            title={search.trim() ? "No matches" : "This folder is empty"}
            description={search.trim() ? "Try a different search term." : "Drag files here, or use New folder / Upload above."}
          />
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
      </div>

      {showNewFolder ? (
        <NewFolderDialog
          onClose={() => setShowNewFolder(false)}
          onCreate={async (name) => {
            const { directoryId } = await createFolder({ name, parentDirectoryId: currentDirectoryId });
            await protectIfTopLevel(directoryId, "Directory");
            invalidateListing();
          }}
        />
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
