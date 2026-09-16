import { formatBytes, formatDate, iconColorClassFor, iconForObject, isPreviewable } from "../format";
import type { VaultObject } from "../types";
import { VaultObjectMenu, type VaultObjectActions } from "./VaultObjectMenu";

// The card-grid alternative to VaultObjectList -- same data, same actions,
// just laid out for scanning by icon/thumbnail rather than by name column.
export function VaultObjectGrid({
  items,
  onOpen,
  ...actions
}: VaultObjectActions & {
  items: VaultObject[];
  onOpen: (item: VaultObject) => void;
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
              onClick={() => (item.type === "directory" ? onOpen(item) : previewable ? actions.onPreview(item) : downloadable ? actions.onDownload(item) : undefined)}
            >
              <span className={`vault-icon-chip vault-icon-chip-lg ${iconColorClassFor(item)}`}>
                <Icon size={30} />
              </span>
              <span className="vault-grid-name" title={item.name}>{item.name}</span>
              <span className="vault-grid-meta">{item.type === "file" ? formatBytes(item.sizeInBytes) : formatDate(item.lastUpdatedDate)}</span>
            </button>
            <div className="vault-grid-actions">
              <VaultObjectMenu item={item} {...actions} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
