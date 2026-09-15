import type { ReactNode } from "react";

export function PageHeader({ actions, icon, subtitle, title }: { actions?: ReactNode; icon?: ReactNode; subtitle: string; title: string }) {
  return (
    <header className="page-header">
      <div className="page-header-heading">
        {icon ? <div className="page-header-icon">{icon}</div> : null}
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}
