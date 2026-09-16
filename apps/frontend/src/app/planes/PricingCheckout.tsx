"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowRight, Check, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";
import type { PublicBillingPlan } from "@/shared/lib/api-client";
import { formatCurrencyCents } from "@/shared/lib/format";
import { businessSlugFromName } from "@movendi/contracts";

export function PricingCheckout({ plans, pilot = false }: { plans: PublicBillingPlan[]; pilot?: boolean }) {
  const [businessName, setBusinessName] = useState("");
  const [shortName, setShortName] = useState<string | null>(null);
  const displayName = shortName ?? businessName.slice(0, 40);
  const slug = businessSlugFromName(displayName);
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
    <header className="pricing-hero"><span><Sparkles size={14} />{pilot ? "Piloto gratuito · Entorno de prueba" : "Plataforma multi-negocio"}</span><h1>Empieza con una operación seria desde el primer día.</h1><p>{pilot ? "Registra tu negocio y prueba sus herramientas. Durante el piloto no necesitas tarjeta ni se realiza ningún cobro. No se activará una suscripción de pago automáticamente." : "Elige un plan, registra tu empresa y activa las herramientas de tu rubro."}</p></header>
    <section className="pricing-plans" aria-label="Planes disponibles">{plans.map((plan, index) => <button type="button" key={plan.id} className={`pricing-plan ${selected === plan.key ? "pricing-plan--selected" : ""}`} onClick={() => setSelected(plan.key)} aria-pressed={selected === plan.key}><span className="pricing-plan__top">{index === 1 ? <b>RECOMENDADO</b> : <i>PLAN</i>}<em>{selected === plan.key ? "Seleccionado" : "Elegir"}</em></span><h2>{plan.name}</h2><p>{plan.description}</p><div><strong>{pilot ? "Gratis" : formatCurrencyCents(plan.monthlyPriceCents)}</strong><small>{pilot ? "durante el piloto" : "/ mes"}</small></div><ul>{plan.features.map((feature) => <li key={feature}><Check size={14} />{feature}</li>)}</ul><footer>{plan.maxUsers} usuarios · {plan.maxMonthlyOperations.toLocaleString("es-PE")} operaciones</footer></button>)}</section>
    <section className="pricing-checkout"><div><span className="section-kicker">{pilot ? "REGISTRO PILOTO" : "ALTA AUTOMATIZADA"}</span><h2>Crea tu espacio de trabajo</h2><p>{pilot ? "Al registrarte se crean tu negocio de prueba, primera sede y acceso de administrador." : "Tu negocio, primera sede y administrador se crean después de confirmar el pago."}</p><ul><li><ShieldCheck size={16} />{pilot ? "Registro gratuito, sin tarjeta ni cobros." : "Pago mediante el proveedor configurado."}</li><li><ShieldCheck size={16} />Panel y herramientas para tu tipo de negocio.</li><li><ShieldCheck size={16} />Acceso privado para tu equipo.</li></ul></div><form onSubmit={submit}>
      <label><span>Razón comercial</span><input name="businessName" required minLength={2} maxLength={120} placeholder="Minimarket Sorayda" value={businessName} onChange={(event) => setBusinessName(event.target.value)} /></label><label><span>Nombre corto</span><input name="businessShortName" required minLength={2} maxLength={40} value={displayName} onChange={(event) => setShortName(event.target.value || null)} /><small>Se completa con el nombre de tu negocio; puedes ajustarlo.</small></label>
      <label><span>Dirección de tu negocio</span><input readOnly value={slug ? `/t/${slug.length < 3 ? `negocio-${slug}` : slug}` : ""} placeholder="Se genera automáticamente" /><small>Se genera sin espacios ni tildes. Si ya existe, añadiremos un identificador.</small></label><label><span>Tipo de negocio</span><select name="businessType" defaultValue="TRANSPORT"><option value="TRANSPORT">Transporte y logística</option><option value="RESTAURANT">Restaurante</option><option value="BARBERSHOP">Barbería y salón</option><option value="MINIMARKET">Minimarket</option></select></label>
      <label><span>Primera sede</span><input name="branchName" required defaultValue="Sede principal" /></label><label><span>País</span><select name="country" defaultValue="PE"><option value="PE">Perú</option><option value="CO">Colombia</option><option value="MX">México</option><option value="CL">Chile</option></select></label>
      <label><span>Administrador</span><input name="adminName" required minLength={2} placeholder="Nombre completo" /></label><label><span>Correo de acceso</span><input name="email" type="email" required placeholder="admin@empresa.com" /></label>
      <label className="pricing-form-wide"><span>Contraseña segura</span><input name="password" type="password" required minLength={10} autoComplete="new-password" placeholder="10+ caracteres, mayúscula, número y símbolo" /></label><label className="pricing-honeypot" aria-hidden="true"><span>Sitio web</span><input name="website" tabIndex={-1} autoComplete="off" /></label>
      <label className="pricing-terms"><input name="acceptedTerms" type="checkbox" required /><span>{pilot ? "Acepto los términos de servicio y entiendo que usaré un entorno de prueba piloto gratuito, sin contratación de pago." : "Acepto los términos de servicio y la contratación mensual recurrente."}</span></label>{error ? <p className="pricing-error" role="alert">{error}</p> : null}<button className="pricing-submit" disabled={pending || !selected}>{pending ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}{pending ? pilot ? "Creando tu negocio…" : "Preparando pago…" : pilot ? "Crear mi negocio de prueba" : "Continuar al pago"}<ArrowRight size={17} /></button>
    </form></section>
  </main>;
}
