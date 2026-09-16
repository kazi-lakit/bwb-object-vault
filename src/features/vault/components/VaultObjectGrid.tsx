import { Copy, Download, Eye, FolderInput, History, MoreVertical, Pencil, RotateCcw, Share2, Trash2, XCircle } from "lucide-react";
import { formatBytes, formatDate, iconColorClassFor, iconForObject, isPreviewable } from "../format";
import type { VaultObject } from "../types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../../../shared/ui/dropdown-menu";

// The card-grid alternative to VaultObjectList -- same data, same actions,
// just laid out for scanning by icon/thumbnail rather than by name column.
export function VaultObjectGrid({
  items,
  onDelete,
  onDownload,
  onCopy,
  onMove,
  onOpen,
  onPreview,
  onPurge,
  onRename,
  onRestore,
  onVersions,
  onShare
}: {
  items: VaultObject[];
  onCopy?: (item: VaultObject) => void;
  onDelete?: (item: VaultObject) => void;
  onDownload: (item: VaultObject) => void;
  onMove?: (item: VaultObject) => void;
  onOpen: (item: VaultObject) => void;
  onPreview: (item: VaultObject) => void;
  onPurge?: (item: VaultObject) => void;
  onRename?: (item: VaultObject) => void;
  onRestore?: (item: VaultObject) => void;
  onShare?: (item: VaultObject) => void;
  onVersions?: (item: VaultObject) => void;
}) {
  return (
    <div className="vault-grid">
      {items.map((item) => {
        const Icon = iconForObject(item);
        const downloadable = item.type === "file" && item.permissions.canDownload;
        const previewable = downloadable && isPreviewable(item);
        return (
          <div key={item.itemId} className="vault-grid-card">
            <button
              className="vault-grid-open"
              disabled={item.type === "file" && !downloadable}
              onClick={() => (item.type === "directory" ? onOpen(item) : previewable ? onPreview(item) : downloadable ? onDownload(item) : undefined)}
            >
              <span className={`vault-icon-chip vault-icon-chip-lg ${iconColorClassFor(item)}`}>
                <Icon size={30} />
              </span>
              <span className="vault-grid-name" title={item.name}>{item.name}</span>
              <span className="vault-grid-meta">{item.type === "file" ? formatBytes(item.sizeInBytes) : formatDate(item.lastUpdatedDate)}</span>
            </button>
            <div className="vault-grid-actions">
              <DropdownMenu>
                <DropdownMenuTrigger className="icon-button" aria-label={`Actions for ${item.name}`}>
                  <MoreVertical size={16} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {previewable ? (
                    <DropdownMenuItem onSelect={() => onPreview(item)}>
                      <Eye size={16} /> Preview
                    </DropdownMenuItem>
                  ) : null}
                  {downloadable ? (
                    <DropdownMenuItem onSelect={() => onDownload(item)}>
                      <Download size={16} /> Download
                    </DropdownMenuItem>
                  ) : null}
                  {downloadable && onVersions ? (
                    <DropdownMenuItem onSelect={() => onVersions(item)}>
                      <History size={16} /> Version history
                    </DropdownMenuItem>
                  ) : null}
                  {item.permissions.canEdit && onRename ? (
                    <DropdownMenuItem onSelect={() => onRename(item)}>
                      <Pencil size={16} /> Rename
                    </DropdownMenuItem>
                  ) : null}
                  {item.permissions.canManage && onShare ? (
                    <DropdownMenuItem onSelect={() => onShare(item)}>
                      <Share2 size={16} /> Share
                    </DropdownMenuItem>
                  ) : null}
                  {item.permissions.canDelete && onMove ? (
                    <DropdownMenuItem onSelect={() => onMove(item)}>
                      <FolderInput size={16} /> Move
                    </DropdownMenuItem>
                  ) : null}
                  {item.type === "file" && item.permissions.canView && onCopy ? (
                    <DropdownMenuItem onSelect={() => onCopy(item)}>
                      <Copy size={16} /> Copy
                    </DropdownMenuItem>
                  ) : null}
                  {item.permissions.canDelete && onRestore ? (
                    <DropdownMenuItem onSelect={() => onRestore(item)}>
                      <RotateCcw size={16} /> Restore
                    </DropdownMenuItem>
                  ) : null}
                  {item.permissions.canDelete && onDelete ? (
                    <DropdownMenuItem destructive onSelect={() => onDelete(item)}>
                      <Trash2 size={16} /> Delete
                    </DropdownMenuItem>
                  ) : null}
                  {item.permissions.canDelete && onPurge ? (
                    <DropdownMenuItem destructive onSelect={() => onPurge(item)}>
                      <XCircle size={16} /> Delete forever
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        );
      })}
    </div>
  );
}
