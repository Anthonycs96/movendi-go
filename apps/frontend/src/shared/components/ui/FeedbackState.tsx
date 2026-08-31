import type { ReactNode } from "react";
import { AlertTriangle, Inbox, LoaderCircle } from "lucide-react";
import { Button } from "./Button";

function FeedbackState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="feedback-state"><div className="feedback-state__icon">{icon}</div><strong>{title}</strong><p>{description}</p>{action}</div>;
}

export function EmptyState({ title = "Aún no hay información", description = "Los nuevos registros aparecerán aquí.", action }: { title?: string; description?: string; action?: ReactNode }) {
  return <FeedbackState icon={<Inbox size={22} />} title={title} description={description} action={action} />;
}

export function LoadingState({ label = "Cargando información" }: { label?: string }) {
  return <FeedbackState icon={<LoaderCircle className="spin" size={22} />} title={label} description="Esto tomará solo un momento." />;
}

export function ErrorState({ retry }: { retry?: () => void }) {
  return <FeedbackState icon={<AlertTriangle size={22} />} title="No pudimos cargar esta vista" description="Revisa tu conexión e inténtalo nuevamente." action={retry ? <Button variant="secondary" onClick={retry}>Reintentar</Button> : null} />;
}
