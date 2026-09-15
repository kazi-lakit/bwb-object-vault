import { Skeleton } from "./Skeleton";

// A shape-matched stand-in for a VaultObjectList/DataTable while it loads --
// used instead of LoadingScreen for in-page content, since that component
// is sized for a full viewport (a whole-screen spinner) and looks broken
// dropped into an already-scrolled section.
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
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
          {Array.from({ length: rows }, (_, index) => (
            <tr key={index}>
              <td>
                <div className="skeleton-name-cell">
                  <Skeleton className="skeleton-icon" />
                  <Skeleton className="skeleton-line" style={{ width: 120 + (index % 3) * 50 }} />
                </div>
              </td>
              <td><Skeleton className="skeleton-line" style={{ width: 48 }} /></td>
              <td><Skeleton className="skeleton-line" style={{ width: 88 }} /></td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GridSkeleton({ tiles = 8 }: { tiles?: number }) {
  return (
    <div className="vault-grid">
      {Array.from({ length: tiles }, (_, index) => (
        <div key={index} className="vault-grid-card">
          <div className="vault-grid-open">
            <Skeleton className="skeleton-icon-lg" />
            <Skeleton className="skeleton-line" style={{ width: 90 + (index % 3) * 20 }} />
            <Skeleton className="skeleton-line" style={{ height: 11, width: 48 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
