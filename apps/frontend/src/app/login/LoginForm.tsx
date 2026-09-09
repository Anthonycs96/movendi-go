"use client";

import { navigateWithFreshSession } from "@/shared/lib/session-navigation";
import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { AlertCircle, Building2, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { APP_DESCRIPTION, APP_LOGO, APP_NAME } from "@/shared/config/brand";
import Link from "next/link";

type Business = { name: string; slug: string; type: string };
export function LoginForm() {
  const [ready, setReady] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessSlug, setBusinessSlug] = useState("");
  useEffect(() => { const timer = setTimeout(() => setReady(true), 0); return () => clearTimeout(timer); }, []);
  function resetSelection() { setBusinesses([]); setBusinessSlug(""); setError(""); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(form.get("email")).trim().toLowerCase(), password: form.get("password"), ...(businessSlug ? { businessSlug } : {}), rememberSession: form.get("remember") === "on" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "No pudimos iniciar sesión.");
      if (result.selectBusiness) {
        setBusinesses(result.businesses); setBusinessSlug(result.businesses[0]?.slug ?? ""); setPending(false); return;
      }
      navigateWithFreshSession(result.redirectTo, true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No pudimos conectar. Intenta nuevamente."); setPending(false); }
  }
  return <div className="login-card">
    <header className="login-card__brand"><div className="product-lockup"><span className="product-mark"><Image src={APP_LOGO} alt={APP_NAME} width={43} height={43} priority /></span><div><strong>{APP_NAME.toLocaleUpperCase("es")}</strong><small>{APP_DESCRIPTION}</small></div></div><span className="secure-access"><ShieldCheck size={14} /> Acceso seguro</span></header>
    <div className="login-card__intro"><span>Bienvenido de nuevo</span><h2>Acceso operativo</h2><p>Ingresa con tu correo y contraseña. Si trabajas en varias empresas, podrás elegir una al continuar.</p></div>
    <form onSubmit={submit}>
      <label className="auth-field"><span>Correo electrónico</span><div><Mail size={17} /><input name="email" type="email" autoComplete="username" placeholder="usuario@empresa.com" onChange={resetSelection} disabled={!ready || pending} required autoFocus /></div></label>
      <label className="auth-field"><span>Contraseña</span><div><LockKeyhole size={17} /><input name="password" aria-label="Contraseña" type={showPassword ? "text" : "password"} autoComplete="current-password" onChange={resetSelection} disabled={!ready || pending} required maxLength={256} /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
      {businesses.length ? <label className="auth-field"><span>Empresa / operación</span><div><Building2 size={17} /><select name="businessSlug" aria-label="Negocio" value={businessSlug} onChange={(event) => setBusinessSlug(event.target.value)} disabled={pending}>{businesses.map((business) => <option value={business.slug} key={business.slug}>{business.name}</option>)}</select></div><small>Tu contraseña fue verificada. Elige dónde quieres trabajar.</small></label> : null}
      {error ? <p className="auth-error" role="alert"><AlertCircle size={16} />{error}</p> : null}
      <label className="remember-session"><input name="remember" type="checkbox" defaultChecked disabled={!ready || pending} /><span>Conservar mi sesión iniciada en este equipo</span></label>
      <button className="auth-submit" type="submit" disabled={pending || !ready}>{pending ? <LoaderCircle className="spin" size={18} /> : null}{pending ? "Iniciando sesión…" : businesses.length ? "Entrar a la empresa" : "Entrar al sistema"}</button>
      <Link className="auth-pricing-link" href="/planes">¿Aún no tienes una cuenta? Ver planes</Link>
    </form>
  </div>;
}
