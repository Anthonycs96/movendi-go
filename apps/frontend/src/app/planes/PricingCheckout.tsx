"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowRight, Check, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";
import type { PublicBillingPlan } from "@/shared/lib/api-client";
import { formatCurrencyCents } from "@/shared/lib/format";

export function PricingCheckout({ plans }: { plans: PublicBillingPlan[] }) {
  const [selected, setSelected] = useState(plans[1]?.key ?? plans[0]?.key ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, planKey: selected, acceptedTerms: form.get("acceptedTerms") === "on" }) });
      const result = await response.json() as { checkout?: { url?: string }; error?: { message?: string } };
      if (!response.ok || !result.checkout?.url) throw new Error(result.error?.message ?? "No pudimos iniciar la contratación.");
      window.location.assign(result.checkout.url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos iniciar la contratación.");
      setPending(false);
    }
  }

  return <main className="pricing-page">
    <nav className="pricing-nav"><Link href="/login" className="pricing-brand"><span>M</span><strong>Movendi</strong></Link><Link href="/login">Ya tengo una cuenta <ArrowRight size={15} /></Link></nav>
    <header className="pricing-hero"><span><Sparkles size={14} /> Plataforma multi-negocio</span><h1>Empieza con una operación seria desde el primer día.</h1><p>Elige un plan, registra tu empresa y activa todos los módulos de tu rubro con cobro mensual y trazabilidad.</p></header>
    <section className="pricing-plans" aria-label="Planes disponibles">{plans.map((plan, index) => <button type="button" key={plan.id} className={`pricing-plan ${selected === plan.key ? "pricing-plan--selected" : ""}`} onClick={() => setSelected(plan.key)} aria-pressed={selected === plan.key}><span className="pricing-plan__top">{index === 1 ? <b>RECOMENDADO</b> : <i>PLAN</i>}<em>{selected === plan.key ? "Seleccionado" : "Elegir"}</em></span><h2>{plan.name}</h2><p>{plan.description}</p><div><strong>{formatCurrencyCents(plan.monthlyPriceCents)}</strong><small>/ mes</small></div><ul>{plan.features.map((feature) => <li key={feature}><Check size={14} />{feature}</li>)}</ul><footer>{plan.maxUsers} usuarios · {plan.maxMonthlyOperations.toLocaleString("es-PE")} operaciones</footer></button>)}</section>
    <section className="pricing-checkout"><div><span className="section-kicker">ALTA AUTOMATIZADA</span><h2>Crea tu espacio de trabajo</h2><p>Tu negocio, primera sede y administrador se crean únicamente después de confirmar el pago.</p><ul><li><ShieldCheck size={16} />Pago procesado por el proveedor configurado.</li><li><ShieldCheck size={16} />Webhook firmado e idempotente.</li><li><ShieldCheck size={16} />Datos aislados desde el aprovisionamiento.</li></ul></div><form onSubmit={submit}>
      <label><span>Razón comercial</span><input name="businessName" required minLength={2} maxLength={120} placeholder="Andes Logística S.A.C." /></label><label><span>Nombre corto</span><input name="businessShortName" required minLength={2} maxLength={40} placeholder="Andes Logística" /></label>
      <label><span>Identificador URL</span><input name="businessSlug" required minLength={3} maxLength={60} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="andes-logistica" /></label><label><span>Tipo de negocio</span><select name="businessType" defaultValue="TRANSPORT"><option value="TRANSPORT">Transporte y logística</option><option value="RESTAURANT">Restaurante</option><option value="BARBERSHOP">Barbería y salón</option><option value="MINIMARKET">Minimarket</option></select></label>
      <label><span>Primera sede</span><input name="branchName" required defaultValue="Sede principal" /></label><label><span>País</span><select name="country" defaultValue="PE"><option value="PE">Perú</option><option value="CO">Colombia</option><option value="MX">México</option><option value="CL">Chile</option></select></label>
      <label><span>Administrador</span><input name="adminName" required minLength={2} placeholder="Nombre completo" /></label><label><span>Correo de acceso</span><input name="email" type="email" required placeholder="admin@empresa.com" /></label>
      <label className="pricing-form-wide"><span>Contraseña segura</span><input name="password" type="password" required minLength={10} autoComplete="new-password" placeholder="10+ caracteres, mayúscula, número y símbolo" /></label><label className="pricing-honeypot" aria-hidden="true"><span>Sitio web</span><input name="website" tabIndex={-1} autoComplete="off" /></label>
      <label className="pricing-terms"><input name="acceptedTerms" type="checkbox" required /><span>Acepto los términos de servicio y la contratación mensual recurrente.</span></label>{error ? <p className="pricing-error" role="alert">{error}</p> : null}<button className="pricing-submit" disabled={pending || !selected}>{pending ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}{pending ? "Preparando pago…" : "Continuar al pago"}<ArrowRight size={17} /></button>
    </form></section>
  </main>;
}
