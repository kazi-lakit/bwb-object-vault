import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveOrganization } from "../organizations/ActiveOrganizationProvider";
import { FolderOpen, FolderPlus, Search, SearchX } from "lucide-react";
import { PageHeader } from "../../shared/ui/PageHeader";
import { ActionButton } from "../../shared/ui/ActionButton";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState } from "../../shared/ui/ErrorState";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { LoadingScreen } from "../../shared/ui/LoadingScreen";
import { ListSkeleton } from "../../shared/ui/ListSkeleton";
import { useToast } from "../../shared/ui/toast";
import { useDriveSetup } from "./useDriveSetup";
import { useDirectoryListing } from "./useDirectoryListing";
import { createFolder, deleteObject, getFileDownloadUrl, uploadFile } from "./vaultApi";
import { resourceTypeOf, type PathEntry, type VaultObject } from "./types";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { VaultObjectList } from "./components/VaultObjectList";
import { NewFolderDialog } from "./components/NewFolderDialog";
import { UploadButton } from "./components/UploadButton";
import { ShareDialog } from "./components/ShareDialog";
import { PreviewModal } from "./components/PreviewModal";
import { DriveSetupScreen } from "./components/DriveSetupScreen";

export function VaultPage() {
  const driveSetup = useDriveSetup();
  const { activeOrgId } = useActiveOrganization();
  const [path, setPath] = useState<PathEntry[]>([]);
  const [search, setSearch] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [previewing, setPreviewing] = useState<VaultObject>();
  const [sharing, setSharing] = useState<VaultObject>();
  const [deleting, setDeleting] = useState<VaultObject>();
  const [isDragging, setIsDragging] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();

  // A folder deeper than the root belongs to a specific org's directory
  // tree -- after switching organizations it no longer resolves, so drop
  // back to "My Drive" rather than showing a 403/empty dead end.
  useEffect(() => {
    setPath([]);
    setSearch("");
  }, [activeOrgId]);

  const currentDirectoryId = path.length > 0 ? path[path.length - 1]!.id : driveSetup.rootDirectoryId;
  const listing = useDirectoryListing(currentDirectoryId, search);

  function invalidateListing() {
    void queryClient.invalidateQueries({ queryKey: ["vault", "objects", currentDirectoryId] });
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
      invalidateListing();
      toast.success(`"${name}" moved to trash.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : `Could not delete "${name}".`);
    }
  }

  async function uploadDroppedFiles(files: FileList) {
    if (!currentDirectoryId) return;
    await Promise.allSettled(Array.from(files).map((file) => uploadFile({ file, parentDirectoryId: currentDirectoryId })));
    invalidateListing();
  }

  if (driveSetup.isLoading) return <LoadingScreen />;
  if (driveSetup.refetchError) {
    return <ErrorState message={driveSetup.refetchError} onRetry={() => window.location.reload()} />;
  }
  if (!driveSetup.isReady) {
    return (
      <DriveSetupScreen
        error={driveSetup.error}
        isCompleting={driveSetup.isCompleting}
        isRetry={driveSetup.needsFolderOnly}
        onSetup={() => void driveSetup.completeSetup()}
      />
    );
  }

  const breadcrumbPath: PathEntry[] = [{ id: driveSetup.rootDirectoryId, name: "My Drive" }, ...path];

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
            <UploadButton parentDirectoryId={currentDirectoryId} onUploaded={invalidateListing} />
          </>
        }
      />

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
        {listing.isLoading ? <ListSkeleton /> : null}
        {listing.isError ? (
          <ErrorState message={listing.error instanceof Error ? listing.error.message : "Could not load this folder."} onRetry={() => listing.refetch()} />
        ) : null}
        {!listing.isLoading && !listing.isError && listing.items.length === 0 ? (
          <EmptyState
            icon={search.trim() ? <SearchX size={26} /> : <FolderOpen size={26} />}
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
            await createFolder({ name, parentDirectoryId: currentDirectoryId });
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
