"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Building2, KeyRound, MapPin, ShieldCheck, UserRound } from "lucide-react";
import type { AuthSessionView } from "@movendi/contracts";
import { Button, Card, Field, Input, PageHeader } from "@/shared/components/ui";
import { initials } from "@/shared/lib/format";

type Feedback = { tone: "success" | "error"; message: string } | null;

async function responseMessage(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { message?: string; error?: { message?: string } } | null;
  return payload?.message ?? payload?.error?.message ?? fallback;
}

export function ProfileWorkspace({ session }: { session: AuthSessionView }) {
  const router = useRouter();
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<Feedback>(null);
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(null);

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    setProfileFeedback(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.get("name"), phone: form.get("phone") }),
    }).catch(() => null);
    if (!response?.ok) {
      setProfileFeedback({ tone: "error", message: response ? await responseMessage(response, "No pudimos actualizar tu perfil.") : "No pudimos conectar con el servidor." });
    } else {
      setProfileFeedback({ tone: "success", message: await responseMessage(response, "Tu perfil fue actualizado.") });
      router.refresh();
    }
    setSavingProfile(false);
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPassword(true);
    setPasswordFeedback(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const newPassword = String(form.get("newPassword") ?? "");
    if (newPassword !== form.get("confirmation")) {
      setPasswordFeedback({ tone: "error", message: "Las nuevas contraseñas no coinciden." });
      setSavingPassword(false);
      return;
    }
    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: form.get("currentPassword"), newPassword }),
    }).catch(() => null);
    if (!response?.ok) {
      setPasswordFeedback({ tone: "error", message: response ? await responseMessage(response, "No pudimos cambiar tu contraseña.") : "No pudimos conectar con el servidor." });
    } else {
      setPasswordFeedback({ tone: "success", message: await responseMessage(response, "Contraseña actualizada.") });
      formElement.reset();
    }
    setSavingPassword(false);
  }

  return <>
    <PageHeader eyebrow="CUENTA PERSONAL" title="Mi perfil" description="Administra tus datos personales y protege tu acceso a Movendi Go." icon={UserRound} />
    <section className="personal-profile-layout">
      <Card className="personal-profile-summary">
        <div className="personal-profile-avatar">{initials(session.userName)}</div>
        <div><h2>{session.userName}</h2><p>{session.userEmail}</p></div>
        <dl>
          <div><dt><ShieldCheck size={15} /> Rol</dt><dd>{session.roleName}</dd></div>
          <div><dt><Building2 size={15} /> Empresa</dt><dd>{session.tenantName}</dd></div>
          <div><dt><MapPin size={15} /> Sede activa</dt><dd>{session.branchName}</dd></div>
        </dl>
        <small>El correo, rol y sede son administrados por la empresa.</small>
      </Card>
      <div className="personal-profile-forms">
        <Card className="personal-profile-card">
          <header><UserRound size={20} /><div><h2>Información personal</h2><p>Estos datos identifican tus operaciones y registros.</p></div></header>
          <form onSubmit={updateProfile}>
            <Field label="Nombre completo"><Input name="name" defaultValue={session.userName} minLength={2} maxLength={100} autoComplete="name" required /></Field>
            <Field label="Teléfono"><Input name="phone" defaultValue={session.userPhone ?? ""} maxLength={30} inputMode="tel" autoComplete="tel" placeholder="Ej. 987 654 321" /></Field>
            <Field label="Correo electrónico" hint="Solicita al administrador cualquier cambio de correo."><Input value={session.userEmail} disabled /></Field>
            {profileFeedback ? <p className={`profile-feedback profile-feedback--${profileFeedback.tone}`} role="status">{profileFeedback.message}</p> : null}
            <Button type="submit" loading={savingProfile}>Guardar cambios</Button>
          </form>
        </Card>
        <Card className="personal-profile-card">
          <header><KeyRound size={20} /><div><h2>Cambiar contraseña</h2><p>Al cambiarla se cerrarán tus otras sesiones abiertas.</p></div></header>
          <form onSubmit={updatePassword}>
            <Field label="Contraseña actual"><Input name="currentPassword" type="password" autoComplete="current-password" required /></Field>
            <Field label="Nueva contraseña" hint="Debe tener al menos 8 caracteres."><Input name="newPassword" type="password" minLength={8} maxLength={100} autoComplete="new-password" required /></Field>
            <Field label="Confirmar nueva contraseña"><Input name="confirmation" type="password" minLength={8} maxLength={100} autoComplete="new-password" required /></Field>
            {passwordFeedback ? <p className={`profile-feedback profile-feedback--${passwordFeedback.tone}`} role="status">{passwordFeedback.message}</p> : null}
            <Button type="submit" loading={savingPassword}>Cambiar contraseña</Button>
          </form>
        </Card>
      </div>
    </section>
  </>;
}
