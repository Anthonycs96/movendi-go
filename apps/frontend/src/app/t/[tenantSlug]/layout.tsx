import { notFound, redirect } from "next/navigation";
import { getManifest } from "@/core/modules/registry";
import { AppShell } from "@/shared/components/layout/AppShell";
import { getSessionContext } from "@/shared/lib/api-client";
import styles from "./pilot-banner.module.css";

export default async function TenantLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const context = await getSessionContext();
  if (!context) redirect("/login");
  const { session, branches } = context;
  if (session.mustChangePassword) redirect("/change-password");
  if (session.tenantSlug !== tenantSlug) notFound();
  const industry = session.tenantType === "BARBERSHOP" ? "barbershop" : session.tenantType === "RESTAURANT" ? "restaurant" : session.tenantType === "MINIMARKET" ? "minimarket" : "transport";
  const manifest = getManifest(industry);
  return <AppShell session={session} branches={branches} manifest={manifest}>{session.pilot ? <aside role="note" className={styles.banner}><details><summary>Piloto gratuito · Entorno de prueba</summary><p>Puedes registrar datos y probar las herramientas. No se cobra una suscripción durante el piloto.</p></details></aside> : null}{children}</AppShell>;
}
