import { Download, Eye, MoreVertical, Share2, Trash2 } from "lucide-react";
import { formatBytes, formatDate, iconColorClassFor, iconForObject, isPreviewable } from "../format";
import type { VaultObject } from "../types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../../../shared/ui/dropdown-menu";

export function VaultObjectList({
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
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Size</th>
            <th>Modified</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const Icon = iconForObject(item);
            const previewable = item.type === "file" && isPreviewable(item);
            return (
              <tr key={item.itemId}>
                <td>
                  <button
                    className="vault-name-cell"
                    onClick={() => (item.type === "directory" ? onOpen(item) : previewable ? onPreview(item) : onDownload(item))}
                  >
                    <span className={`vault-icon-chip ${iconColorClassFor(item)}`}>
                      <Icon size={16} />
                    </span>
                    <span>{item.name}</span>
                  </button>
                </td>
                <td className="muted">{item.type === "file" ? formatBytes(item.sizeInBytes) : "—"}</td>
                <td className="muted">{formatDate(item.lastUpdatedDate)}</td>
                <td>
                  <div className="row-actions">
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
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
