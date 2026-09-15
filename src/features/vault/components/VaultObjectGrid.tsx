import { Download, Eye, MoreVertical, Share2, Trash2 } from "lucide-react";
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
  onOpen,
  onPreview,
  onShare
}: {
  items: VaultObject[];
  onDelete: (item: VaultObject) => void;
  onDownload: (item: VaultObject) => void;
  onOpen: (item: VaultObject) => void;
  onPreview: (item: VaultObject) => void;
  onShare: (item: VaultObject) => void;
}) {
  return (
    <div className="vault-grid">
      {items.map((item) => {
        const Icon = iconForObject(item);
        const previewable = item.type === "file" && isPreviewable(item);
        return (
          <div key={item.itemId} className="vault-grid-card">
            <button
              className="vault-grid-open"
              onClick={() => (item.type === "directory" ? onOpen(item) : previewable ? onPreview(item) : onDownload(item))}
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
                  {item.type === "file" ? (
                    <DropdownMenuItem onSelect={() => onDownload(item)}>
                      <Download size={16} /> Download
                    </DropdownMenuItem>
                  ) : null}
                  {item.permissions.canManage ? (
                    <DropdownMenuItem onSelect={() => onShare(item)}>
                      <Share2 size={16} /> Share
                    </DropdownMenuItem>
                  ) : null}
                  {item.permissions.canDelete ? (
                    <DropdownMenuItem destructive onSelect={() => onDelete(item)}>
                      <Trash2 size={16} /> Delete
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
