"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button, Input } from "@/shared/components/ui";

export function ForcedPasswordForm({ userName }: { userName: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");
    if (newPassword !== confirmation) { setError("Las nuevas contraseñas no coinciden."); return; }
    setPending(true); setError("");
    try {
      const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error?.message ?? "No pudimos actualizar la contraseña.");
      const requested = searchParams.get("next") ?? "/";
      router.replace(requested.startsWith("/") && !requested.startsWith("//") ? requested : "/");
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No pudimos actualizar la contraseña."); setPending(false); }
  }

  return <main className="auth-page"><div className="auth-page__grid" /><section className="login-card" style={{ maxWidth: 520, margin: "auto" }}><header className="login-card__brand"><span className="login-card__logo"><KeyRound size={24} /></span><div><strong>Movendi Go</strong><small>Protección de cuenta</small></div><span className="login-security"><ShieldCheck size={14} /> Acceso seguro</span></header><div className="login-card__heading"><span>PRIMER INGRESO</span><h1>Crea tu contraseña personal</h1><p>Hola, {userName}. La clave temporal solo sirve para este ingreso.</p></div><form onSubmit={submit} className="login-form"><label><span>Contraseña temporal</span><Input name="currentPassword" type="password" autoComplete="current-password" required /></label><label><span>Nueva contraseña</span><Input name="newPassword" type="password" minLength={8} maxLength={100} autoComplete="new-password" required /></label><label><span>Confirmar nueva contraseña</span><Input name="confirmation" type="password" minLength={8} maxLength={100} autoComplete="new-password" required /></label>{error ? <p className="login-error" role="alert">{error}</p> : null}<Button type="submit" size="lg" loading={pending}>Guardar y continuar</Button></form></section></main>;
}
