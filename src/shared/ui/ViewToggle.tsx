import { LayoutGrid, List } from "lucide-react";

export function ViewToggle({ onChange, value }: { onChange: (mode: "grid" | "list") => void; value: "grid" | "list" }) {
  return (
    <div className="view-toggle" role="group" aria-label="View">
      <button type="button" className={value === "list" ? "active" : ""} aria-label="List view" title="List view" onClick={() => onChange("list")}>
        <List size={16} />
      </button>
      <button type="button" className={value === "grid" ? "active" : ""} aria-label="Grid view" title="Grid view" onClick={() => onChange("grid")}>
        <LayoutGrid size={16} />
      </button>
    </div>
  );
}
