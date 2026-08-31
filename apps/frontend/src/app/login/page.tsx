import { redirect } from "next/navigation";
import { Building2, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { getSessionContext } from "@/shared/lib/api-client";
import { LoginForm } from "./LoginForm";

const capabilities = [
  { title: "Acceso por empresa", description: "Cada usuario entra directamente a la operación que le corresponde.", Icon: Building2 },
  { title: "Control por roles", description: "Permisos claros para trabajar con seguridad y trazabilidad.", Icon: ShieldCheck },
  { title: "Operación conectada", description: "Agenda, salón, caja y equipo coordinados en un mismo sistema.", Icon: CheckCircle2 },
];

export default async function LoginPage() {
  const context = await getSessionContext();
  if (context?.session.mustChangePassword) redirect("/change-password");
  if (context) redirect(`/t/${context.session.tenantSlug}/dashboard`);

  return <main className="auth-page">
    <div className="auth-page__grid" />
    <div className="auth-shell">
      <section className="auth-showcase">
        <div className="auth-showcase__glow auth-showcase__glow--top" />
        <div className="auth-showcase__glow auth-showcase__glow--bottom" />
        <div className="auth-showcase__copy">
          <span className="auth-kicker"><Sparkles size={14} /> Gestión operativa unificada</span>
          <h1>Tu operación completa, en un solo lugar.</h1>
          <p>Planifica, atiende y controla cada empresa con la información y los permisos correctos para tu equipo.</p>
        </div>
        <div className="auth-capabilities">
          {capabilities.map(({ title, description, Icon }) => <article key={title}>
            <span><Icon size={20} /></span>
            <div><strong>{title}</strong><p>{description}</p></div>
          </article>)}
        </div>
      </section>
      <section className="auth-panel"><LoginForm /></section>
    </div>
  </main>;
}
