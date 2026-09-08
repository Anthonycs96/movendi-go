"use client";

import { navigateWithFreshSession } from "@/shared/lib/session-navigation";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Building2, CheckCircle2, ChevronDown, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { APP_DESCRIPTION, APP_LOGO, APP_NAME } from "@/shared/config/brand";
import Link from "next/link";

interface BusinessOption {
  name: string;
  slug: string;
  status: string;
  type: string;
}

type LookupStatus = "idle" | "loading" | "platform" | "found" | "multiple" | "not_found" | "error";
interface LookupResult { businesses: BusinessOption[]; platformRole: string | null }

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const businessTypes: Record<string, string> = { BARBERSHOP: "Barbería", RESTAURANT: "Restaurante", TRANSPORT: "Transporte" };

export function LoginForm() {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookupCacheRef = useRef<{ email: string; result: LookupResult } | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [ready, setReady] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [lookupStatus, setLookupStatus] = useState<LookupStatus>("idle");
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [businessOpen, setBusinessOpen] = useState(false);
  const [platformRole, setPlatformRole] = useState<string | null>(null);
  const [values, setValues] = useState({ email: "", password: "", businessSlug: "" });
  const selectedBusiness = useMemo(() => businesses.find((business) => business.slug === values.businessSlug) ?? businesses[0] ?? null, [businesses, values.businessSlug]);

  useEffect(() => {
    const readyTimer = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(readyTimer);
  }, []);

  async function lookupBusinesses(email: string, signal?: AbortSignal) {
    const response = await fetch("/api/auth/lookup-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }), signal });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error();
    const lookupResult = { businesses: (result.businesses ?? []) as BusinessOption[], platformRole: typeof result.platformRole === "string" ? result.platformRole : null } satisfies LookupResult;
    lookupCacheRef.current = { email, result: lookupResult };
    return lookupResult;
  }

  function applyLookupOptions(result: LookupResult) {
    const { businesses: options, platformRole: detectedPlatformRole } = result;
    setPlatformRole(detectedPlatformRole);
    setBusinesses(options);
    if (detectedPlatformRole) {
      setValues((current) => ({ ...current, businessSlug: "" }));
      setBusinessOpen(false);
      setLookupStatus("platform");
      return "";
    }
    if (!options.length) {
      setValues((current) => ({ ...current, businessSlug: "" }));
      setBusinessOpen(false);
      setLookupStatus("not_found");
      return "";
    }

    setBusinessOpen(false);
    setLookupStatus(options.length > 1 ? "multiple" : "found");
    let resolvedSlug = "";
    setValues((current) => {
      resolvedSlug = options.some((option) => option.slug === current.businessSlug) ? current.businessSlug : options[0].slug;
      return { ...current, businessSlug: resolvedSlug };
    });
    return resolvedSlug || options[0].slug;
  }

  useEffect(() => {
    const email = values.email.trim().toLowerCase();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!emailPattern.test(email)) return;
    const controller = new AbortController();
    debounceRef.current = setTimeout(async () => {
      setLookupStatus("loading");
      try {
        applyLookupOptions(await lookupBusinesses(email, controller.signal));
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setLookupStatus("error");
        setBusinesses([]);
        setPlatformRole(null);
      }
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      controller.abort();
    };
  }, [values.email]);

  async function submit() {
    setPending(true);
    setError("");
    try {
      const formData = formRef.current ? new FormData(formRef.current) : null;
      const email = String(formData?.get("email") ?? values.email).trim().toLowerCase();
      const password = String(formData?.get("password") ?? values.password);
      let businessSlug = String(formData?.get("businessSlug") ?? values.businessSlug).trim().toLowerCase();
      if (!emailPattern.test(email)) throw new Error("Ingresa un correo empresarial válido.");
      if (!password) throw new Error("Ingresa tu contraseña.");

      if (!businessSlug) {
        const cachedLookup = lookupCacheRef.current?.email === email ? lookupCacheRef.current.result : null;
        if (!cachedLookup) setLookupStatus("loading");
        const lookup = cachedLookup ?? await lookupBusinesses(email);
        businessSlug = applyLookupOptions(lookup);
        if (!businessSlug && !lookup.platformRole) throw new Error("No encontramos una empresa vinculada a este correo. Ingresa el identificador de la operación.");
      }

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, ...(businessSlug ? { businessSlug } : {}), rememberSession }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error?.message ?? "No pudimos iniciar sesión.");
      navigateWithFreshSession(result.redirectTo, true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos iniciar sesión.");
      setPending(false);
    }
  }

  function changeEmail(email: string) {
    setValues((current) => ({ ...current, email, businessSlug: email === current.email ? current.businessSlug : "" }));
    if (!emailPattern.test(email.trim())) {
      setLookupStatus("idle");
      setBusinesses([]);
      setPlatformRole(null);
      setBusinessOpen(false);
    }
  }

  const lookupMessage = lookupStatus === "loading" ? "Buscando operaciones vinculadas…" : lookupStatus === "platform" ? "Acceso global detectado: administrarás todos los negocios de la plataforma." : lookupStatus === "not_found" ? "No encontramos una operación para este correo; puedes ingresar el identificador manualmente." : lookupStatus === "error" ? "No se pudo detectar la operación; ingresa el identificador manualmente." : "La operación se detecta automáticamente desde tu correo empresarial.";

  return <div className="login-card">
    <header className="login-card__brand">
      <div className="product-lockup"><span className="product-mark"><Image src={APP_LOGO} alt={APP_NAME} width={43} height={43} priority /></span><div><strong>{APP_NAME.toLocaleUpperCase("es")}</strong><small>{APP_DESCRIPTION}</small></div></div>
      <span className="secure-access"><ShieldCheck size={14} /> Acceso seguro</span>
    </header>
    <div className="login-card__intro"><span>Bienvenido de nuevo</span><h2>Acceso operativo</h2><p>Ingresa con tu correo empresarial; encontraremos tu operación automáticamente.</p></div>
    <form ref={formRef} onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void submit(); }} noValidate>
      <label className="auth-field"><span>Correo electrónico</span><div><Mail size={17} /><input name="email" type="email" autoComplete="email" placeholder="usuario@empresa.com" value={values.email} onChange={(event) => changeEmail(event.target.value)} disabled={!ready || pending} required autoFocus /></div></label>
      <label className="auth-field"><span>{platformRole ? "Tipo de acceso" : selectedBusiness ? "Empresa detectada" : "Empresa / operación"}</span>
        {platformRole ? <div><ShieldCheck size={17} /><input aria-label="Tipo de acceso" value="Super Admin · Control global" readOnly disabled /></div> : selectedBusiness && ["found", "multiple"].includes(lookupStatus) ? <div className="business-picker">
          <button type="button" aria-label="Negocio" aria-haspopup="listbox" aria-expanded={businessOpen} disabled={!ready || pending} onClick={() => lookupStatus === "multiple" && setBusinessOpen((current) => !current)}>
            <span className="business-picker__icon"><Building2 size={18} /></span><span className="business-picker__copy"><strong>{selectedBusiness.name}</strong><small>{businessTypes[selectedBusiness.type] ?? selectedBusiness.type} · /{selectedBusiness.slug}</small></span>{lookupStatus === "multiple" ? <ChevronDown size={16} /> : <CheckCircle2 size={16} />}
          </button>
          {businessOpen ? <div className="business-picker__menu" role="listbox" aria-label="Operaciones disponibles">{businesses.map((business) => <button type="button" role="option" aria-selected={business.slug === selectedBusiness.slug} key={business.slug} onClick={() => { setValues({ ...values, businessSlug: business.slug }); setBusinessOpen(false); }}><Building2 size={15} /><span><strong>{business.name}</strong><small>/{business.slug}</small></span></button>)}</div> : null}
        </div> : <div><Building2 size={17} /><input name="businessSlug" aria-label="Negocio" autoComplete="organization" placeholder="ej: mi-empresa" value={values.businessSlug} onChange={(event) => setValues({ ...values, businessSlug: event.target.value })} disabled={!ready || pending} required />{lookupStatus === "loading" ? <LoaderCircle className="spin" size={16} /> : null}</div>}
        <small className={`auth-help auth-help--${lookupStatus}`}>{lookupMessage}</small>
      </label>
      <label className="auth-field"><span className="auth-field__heading"><b>Contraseña</b><em>Protegida con cifrado seguro</em></span><div><LockKeyhole size={17} /><input name="password" aria-label="Contraseña" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="••••••••" value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} disabled={!ready || pending} required /><button type="button" onClick={() => setShowPassword((value) => !value)} disabled={!ready || pending} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
      {error ? <p className="auth-error" role="alert"><AlertCircle size={16} />{error}</p> : null}
      <label className="remember-session"><input type="checkbox" checked={rememberSession} onChange={(event) => setRememberSession(event.target.checked)} disabled={!ready || pending} /><span>Conservar mi sesión iniciada en este equipo</span></label>
      <button className="auth-submit" type="submit" disabled={pending || !ready}>{pending ? <LoaderCircle className="spin" size={18} /> : null}{pending ? "Iniciando sesión…" : "Entrar al sistema"}</button>
      <Link className="auth-pricing-link" href="/planes">¿Aún no tienes una cuenta? Ver planes</Link>
    </form>
  </div>;
}
