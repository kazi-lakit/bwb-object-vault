import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveOrganization } from "../organizations/ActiveOrganizationProvider";
import { FolderCog, FolderPlus } from "lucide-react";
import { PageHeader } from "../../shared/ui/PageHeader";
import { ActionButton } from "../../shared/ui/ActionButton";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState } from "../../shared/ui/ErrorState";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { GridSkeleton, ListSkeleton } from "../../shared/ui/ListSkeleton";
import { ViewToggle } from "../../shared/ui/ViewToggle";
import { useToast } from "../../shared/ui/toast";
import { useDirectoryListing } from "./useDirectoryListing";
import { useViewMode } from "./useViewMode";
import { createFolder, deleteObject, getFileDownloadUrl, uploadFile } from "./vaultApi";
import { resourceTypeOf, type PathEntry, type VaultObject } from "./types";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { VaultObjectList } from "./components/VaultObjectList";
import { VaultObjectGrid } from "./components/VaultObjectGrid";
import { NewFolderDialog } from "./components/NewFolderDialog";
import { UploadButton } from "./components/UploadButton";
import { ShareDialog } from "./components/ShareDialog";
import { PreviewModal } from "./components/PreviewModal";

const SYSTEM_ROOT: PathEntry = { id: undefined, name: "System Files" };

// This project's dedicated "System Files" directory -- a fixed id, same
// approach as useVaultAnchor's "Cloud" id, rather than discovered at
// runtime.
const SYSTEM_FILES_ROOT_ID = "fc118fc5-8592-4b24-89fc-fc5721176af2";

// Browses that directory directly, separate from a user's personal drive
// folder (see VaultPage) -- so this is where anything shared at that level
// shows up. Storage's get-objects already filters to what the caller can
// see, so no extra ownership/access filtering is needed here: a user only
// ever gets back items they created or were granted access to.
export function SystemFilesPage() {
  const { activeOrgId } = useActiveOrganization();
  const [path, setPath] = useState<PathEntry[]>([SYSTEM_ROOT]);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [previewing, setPreviewing] = useState<VaultObject>();
  const [sharing, setSharing] = useState<VaultObject>();
  const [deleting, setDeleting] = useState<VaultObject>();
  const [isDragging, setIsDragging] = useState(false);
  const [viewMode, setViewMode] = useViewMode();
  const queryClient = useQueryClient();
  const toast = useToast();

  useEffect(() => {
    setPath([SYSTEM_ROOT]);
  }, [activeOrgId]);

  const atRoot = path.length === 1;
  const currentDirectoryId = atRoot ? SYSTEM_FILES_ROOT_ID : path[path.length - 1]!.id;
  const listing = useDirectoryListing(currentDirectoryId, "");

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["vault", "objects", currentDirectoryId] });
  }

  function openFolder(item: VaultObject) {
    setPath((current) => [...current, { id: item.itemId, name: item.name }]);
  }

  async function handleDownload(item: VaultObject) {
    try {
      const url = await getFileDownloadUrl(item.itemId);
      window.open(url, "_blank", "noreferrer");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : `Could not download "${item.name}".`);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    const name = deleting.name;
    try {
      await deleteObject({ permanent: false, resourceId: deleting.itemId, resourceType: resourceTypeOf(deleting) });
      setDeleting(undefined);
      invalidate();
      toast.success(`"${name}" moved to trash.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : `Could not delete "${name}".`);
    }
  }

  async function uploadDroppedFiles(files: FileList) {
    if (!currentDirectoryId) return;
    await Promise.allSettled(Array.from(files).map((file) => uploadFile({ file, parentDirectoryId: currentDirectoryId })));
    invalidate();
  }

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
        icon={<FolderCog size={20} />}
        title="System Files"
        subtitle="Folders and files you created or have access to."
        actions={
          <>
            <ActionButton variant="icon" icon={<FolderPlus size={18} />} onClick={() => setShowNewFolder(true)} title="New folder" />
            <UploadButton parentDirectoryId={currentDirectoryId} onUploaded={invalidate} />
          </>
        }
      />

      <div className="toolbar">
        <span />
        <ViewToggle value={viewMode} onChange={setViewMode} />
      </div>

      {!atRoot ? <Breadcrumbs path={path} onNavigate={(index) => setPath((current) => current.slice(0, index + 1))} /> : null}

      <div className={isDragging ? "vault-dropzone vault-dropzone-active" : "vault-dropzone"}>
        {listing.isLoading ? (viewMode === "grid" ? <GridSkeleton /> : <ListSkeleton />) : null}
        {listing.isError ? (
          <ErrorState message={listing.error instanceof Error ? listing.error.message : "Could not load items."} onRetry={() => listing.refetch()} />
        ) : null}
        {!listing.isLoading && !listing.isError && listing.items.length === 0 ? (
          <EmptyState
            icon={<FolderCog size={26} />}
            title="This folder is empty"
            description="Drag files here, or use New folder / Upload above."
          />
        ) : null}
        {listing.items.length > 0 ? (
          viewMode === "grid" ? (
            <VaultObjectGrid
              items={listing.items}
              onOpen={openFolder}
              onPreview={setPreviewing}
              onDownload={handleDownload}
              onShare={setSharing}
              onDelete={setDeleting}
            />
          ) : (
            <VaultObjectList
              items={listing.items}
              onOpen={openFolder}
              onPreview={setPreviewing}
              onDownload={handleDownload}
              onShare={setSharing}
              onDelete={setDeleting}
            />
          )
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
            await createFolder({ name, parentDirectoryId: currentDirectoryId });
            invalidate();
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
