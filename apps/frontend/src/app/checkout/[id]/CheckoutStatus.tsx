"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, CreditCard, LoaderCircle, ShieldCheck } from "lucide-react";
import type { PublicCheckoutView } from "@/shared/lib/api-client";
import { formatCurrencyCents } from "@/shared/lib/format";

export function CheckoutStatus({ initial }: { initial: PublicCheckoutView }) {
  const router = useRouter();
  const [checkout, setCheckout] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function simulate() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/billing/mock/${checkout.id}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outcome: "success" }) });
      const result = await response.json() as { checkout?: { status: string; tenantSlug: string | null }; error?: { message?: string } };
      if (!response.ok || !result.checkout) throw new Error(result.error?.message ?? "No se pudo confirmar la simulación.");
      setCheckout((current) => ({ ...current, status: result.checkout!.status, tenantSlug: result.checkout!.tenantSlug, completedAt: new Date().toISOString() }));
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo confirmar la simulación."); }
    finally { setPending(false); }
  }

  const completed = checkout.status === "COMPLETED";
  return <main className="checkout-page"><section className="checkout-card"><div className={`checkout-icon ${completed ? "checkout-icon--success" : ""}`}>{completed ? <CheckCircle2 size={32} /> : <CreditCard size={32} />}</div><span className="section-kicker">{checkout.provider === "mock" ? "ENTORNO LOCAL" : "PAGO SEGURO"}</span><h1>{completed ? "Tu negocio está listo" : "Confirma tu suscripción"}</h1><p>{completed ? `${checkout.businessName} fue aprovisionado correctamente. Ya puedes iniciar sesión.` : `Activarás ${checkout.businessName} con el plan ${checkout.plan.name}.`}</p><dl><div><dt>Plan</dt><dd>{checkout.plan.name}</dd></div><div><dt>Importe</dt><dd>{formatCurrencyCents(checkout.amountCents)} / mes</dd></div><div><dt>Correo</dt><dd>{checkout.email}</dd></div><div><dt>Estado</dt><dd>{checkout.status}</dd></div></dl>{checkout.provider === "mock" && !completed ? <><div className="checkout-notice"><ShieldCheck size={18} /><span><strong>Simulador visible sólo en desarrollo</strong><small>No procesa una tarjeta ni representa un cobro real.</small></span></div><button className="pricing-submit" disabled={pending} onClick={simulate}>{pending ? <LoaderCircle className="spin" size={17} /> : <CreditCard size={17} />}{pending ? "Procesando…" : "Simular pago aprobado"}</button></> : null}{completed ? <Link className="pricing-submit" href="/login">Ingresar a Movendi</Link> : null}{error ? <p className="pricing-error" role="alert">{error}</p> : null}</section></main>;
}
