import { Copy, Download, Eye, FolderInput, History, MoreVertical, Pencil, RotateCcw, Share2, Trash2, XCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../../../shared/ui/dropdown-menu";
import { isPreviewable } from "../format";
import type { VaultObject } from "../types";

export type VaultObjectActions = {
  onCopy?: (item: VaultObject) => void;
  onDelete?: (item: VaultObject) => void;
  onDownload: (item: VaultObject) => void;
  onMove?: (item: VaultObject) => void;
  onPreview: (item: VaultObject) => void;
  onPurge?: (item: VaultObject) => void;
  onRename?: (item: VaultObject) => void;
  onRestore?: (item: VaultObject) => void;
  onShare?: (item: VaultObject) => void;
  onVersions?: (item: VaultObject) => void;
};

// List and tile views deliberately share this exact component. Action
// availability depends only on the object type/capabilities and the callbacks
// supplied by the page, never on which visual layout is active.
export function VaultObjectMenu({ item, ...actions }: VaultObjectActions & { item: VaultObject }) {
  const downloadable = item.type === "file" && item.permissions.canDownload;
  const previewable = downloadable && Boolean(isPreviewable(item));
  const canRename = item.permissions.canEdit && Boolean(actions.onRename);
  const canShare = item.permissions.canManage && Boolean(actions.onShare);
  const canMove = item.permissions.canDelete && Boolean(actions.onMove);
  const canCopy = item.type === "file" && item.permissions.canView && Boolean(actions.onCopy);
  const canRestore = item.permissions.canDelete && Boolean(actions.onRestore);
  const canDelete = item.permissions.canDelete && Boolean(actions.onDelete);
  const canPurge = item.permissions.canDelete && Boolean(actions.onPurge);
  const canViewVersions = downloadable && Boolean(actions.onVersions);
  const hasActions = previewable || downloadable || canViewVersions || canRename || canShare || canMove || canCopy || canRestore || canDelete || canPurge;

  if (!hasActions) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="icon-button" aria-label={`Actions for ${item.name}`}>
        <MoreVertical size={16} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {previewable ? <DropdownMenuItem onSelect={() => actions.onPreview(item)}><Eye size={16} /> Preview</DropdownMenuItem> : null}
        {downloadable ? <DropdownMenuItem onSelect={() => actions.onDownload(item)}><Download size={16} /> Download</DropdownMenuItem> : null}
        {canViewVersions ? <DropdownMenuItem onSelect={() => actions.onVersions?.(item)}><History size={16} /> Version history</DropdownMenuItem> : null}
        {canRename ? <DropdownMenuItem onSelect={() => actions.onRename?.(item)}><Pencil size={16} /> Rename</DropdownMenuItem> : null}
        {canShare ? <DropdownMenuItem onSelect={() => actions.onShare?.(item)}><Share2 size={16} /> Share</DropdownMenuItem> : null}
        {canMove ? <DropdownMenuItem onSelect={() => actions.onMove?.(item)}><FolderInput size={16} /> Move</DropdownMenuItem> : null}
        {canCopy ? <DropdownMenuItem onSelect={() => actions.onCopy?.(item)}><Copy size={16} /> Copy</DropdownMenuItem> : null}
        {canRestore ? <DropdownMenuItem onSelect={() => actions.onRestore?.(item)}><RotateCcw size={16} /> Restore</DropdownMenuItem> : null}
        {canDelete ? <DropdownMenuItem destructive onSelect={() => actions.onDelete?.(item)}><Trash2 size={16} /> Delete</DropdownMenuItem> : null}
        {canPurge ? <DropdownMenuItem destructive onSelect={() => actions.onPurge?.(item)}><XCircle size={16} /> Delete forever</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
