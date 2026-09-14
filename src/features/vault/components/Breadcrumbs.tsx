import { ChevronRight } from "lucide-react";
import type { PathEntry } from "../types";

export function Breadcrumbs({ path, onNavigate }: { onNavigate: (index: number) => void; path: PathEntry[] }) {
  return (
    <nav className="vault-breadcrumbs" aria-label="Breadcrumb">
      {path.map((entry, index) => {
        const isLast = index === path.length - 1;
        return (
          <span key={entry.id ?? "root"} className="vault-breadcrumb-entry">
            {index > 0 ? <ChevronRight size={14} /> : null}
            {isLast ? (
              <span className="vault-breadcrumb-current">{entry.name}</span>
            ) : (
              <button className="link-button" onClick={() => onNavigate(index)}>{entry.name}</button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
