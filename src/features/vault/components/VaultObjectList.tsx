import { formatBytes, formatDate, iconColorClassFor, iconForObject, isPreviewable } from "../format";
import type { VaultObject } from "../types";
import { VaultObjectMenu, type VaultObjectActions } from "./VaultObjectMenu";

export function VaultObjectList({
  items,
  onOpen,
  ...actions
}: VaultObjectActions & {
  items: VaultObject[];
  onOpen: (item: VaultObject) => void;
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
            const downloadable = item.type === "file" && item.permissions.canDownload;
            const previewable = downloadable && isPreviewable(item);
            return (
              <tr key={item.itemId}>
                <td>
                  <button
                    className="vault-name-cell"
                    disabled={item.type === "file" && !downloadable}
                    onClick={() => (item.type === "directory" ? onOpen(item) : previewable ? actions.onPreview(item) : downloadable ? actions.onDownload(item) : undefined)}
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
                    <VaultObjectMenu item={item} {...actions} />
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
