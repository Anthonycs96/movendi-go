"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import type { PublicCheckoutView } from "@/shared/lib/api-client";
import { formatCurrencyCents } from "@/shared/lib/format";

export function CheckoutStatus({ initial }: { initial: PublicCheckoutView }) {
  const router = useRouter();
  const [checkout, setCheckout] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const pilot = checkout.pilot === true || checkout.provider === "pilot";

  async function simulate() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(pilot ? `/api/billing/pilot/${checkout.id}/activate` : `/api/billing/mock/${checkout.id}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outcome: "success" }) });
      const result = await response.json() as { checkout?: { status: string; tenantSlug: string | null }; error?: { message?: string } };
      if (!response.ok || !result.checkout) throw new Error(result.error?.message ?? "No se pudo completar el registro.");
      setCheckout((current) => ({ ...current, status: result.checkout!.status, tenantSlug: result.checkout!.tenantSlug, completedAt: new Date().toISOString() }));
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo completar el registro."); }
    finally { setPending(false); }
  }

  const completed = checkout.status === "COMPLETED";
  const open = checkout.status === "OPEN";
  const status = completed ? pilot ? "Prueba activa" : "Completado" : open ? "Pendiente de confirmación" : checkout.status === "EXPIRED" ? "Expirado" : "Registro no disponible";
  return <main className="checkout-page"><section className="checkout-card">
    <div className={`checkout-icon ${completed ? "checkout-icon--success" : ""}`}>{completed ? <CheckCircle2 size={32} /> : <ShieldCheck size={32} />}</div>
    <span className="section-kicker">{pilot ? "PILOTO GRATUITO · ENTORNO DE PRUEBA" : checkout.provider === "mock" ? "ENTORNO LOCAL" : "PAGO SEGURO"}</span>
    <h1>{completed ? "Tu negocio está listo" : pilot ? "Activa tu negocio de prueba" : "Confirma tu suscripción"}</h1>
    <p>{completed ? `${checkout.businessName} ya tiene su panel y herramientas. Inicia sesión con el correo y la contraseña que registraste.` : `Activarás ${checkout.businessName} con el plan ${checkout.plan.name}.`}</p>
    <dl><div><dt>Plan</dt><dd>{checkout.plan.name}</dd></div><div><dt>{pilot ? "Costo durante el piloto" : "Importe"}</dt><dd>{pilot ? "Gratis · Sin cobros" : `${formatCurrencyCents(checkout.amountCents)} / mes`}</dd></div><div><dt>Correo</dt><dd>{checkout.email}</dd></div><div><dt>Estado</dt><dd>{status}</dd></div></dl>
    {pilot ? <div className="checkout-notice"><ShieldCheck size={18} /><span><strong>Estás participando en una prueba piloto</strong><small>No necesitas tarjeta. No se ha realizado ningún cobro ni se activará un pago automáticamente.</small></span></div> : null}
    {checkout.provider === "mock" && !pilot && open ? <div className="checkout-notice"><ShieldCheck size={18} /><span><strong>Simulador visible sólo en desarrollo</strong><small>No procesa una tarjeta ni representa un cobro real.</small></span></div> : null}
    {open && (pilot || checkout.provider === "mock") ? <button className="pricing-submit" disabled={pending} onClick={simulate}>{pending ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}{pending ? "Creando tu negocio…" : pilot ? "Activar prueba gratuita" : "Simular pago aprobado"}</button> : null}
    {completed ? <Link className="pricing-submit" href="/login">Ingresar a mi panel</Link> : !open ? <Link href="/planes">Volver al registro</Link> : null}
    {error ? <p className="pricing-error" role="alert">{error}</p> : null}
  </section></main>;
}
