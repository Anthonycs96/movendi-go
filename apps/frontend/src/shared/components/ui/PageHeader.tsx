import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { PanelsTopLeft } from "lucide-react";

export function PageHeader({ eyebrow, title, description, actions, icon: Icon = PanelsTopLeft }: { eyebrow?: string; title: string; description: string; actions?: ReactNode; icon?: LucideIcon }) {
  return (
    <header className="page-header">
      <div className="page-header__identity">
        <span className="page-header__icon"><Icon size={20} /></span>
        <div>
          {eyebrow ? <span className="page-header__eyebrow">{eyebrow}</span> : null}
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}
