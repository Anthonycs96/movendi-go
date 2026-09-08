"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BarChart3, BookOpenCheck, Building2, CreditCard, LayoutDashboard, LogOut, Menu, ReceiptText, Settings, ShieldCheck, Tags, Users, WalletCards, X } from "lucide-react";
import { APP_LOGO, APP_NAME } from "@/shared/config/brand";
import { cn } from "@/shared/lib/cn";
import { initials } from "@/shared/lib/format";
import { ThemeToggle } from "@/shared/components/layout/ThemeToggle";
import { canAccessPlatformSection, type PlatformRole, type PlatformSection } from "@/core/platform/access";
import type { BusinessAccessSummary } from "@movendi/contracts";
import { Select } from "@/shared/components/ui";

const navigation: Array<{ path: PlatformSection; label: string; description: string; icon: typeof LayoutDashboard }> = [
  { path: "dashboard", label: "Resumen", description: "Pulso global", icon: LayoutDashboard },
  { path: "businesses", label: "Negocios", description: "Tenants y consumo", icon: Building2 },
  { path: "plans", label: "Planes", description: "Oferta comercial", icon: Tags },
  { path: "subscriptions", label: "Suscripciones", description: "Ciclo y cobro", icon: CreditCard },
  { path: "billing", label: "Cobranza", description: "Pagos y eventos", icon: WalletCards },
  { path: "users", label: "Equipo", description: "Accesos globales", icon: Users },
  { path: "audit", label: "Auditoría", description: "Trazabilidad", icon: ReceiptText },
  { path: "catalog", label: "Rubros y módulos", description: "Oferta funcional", icon: BookOpenCheck },
  { path: "settings", label: "Configuración", description: "Estado de plataforma", icon: Settings },
];

export function PlatformShell({ user, currentTenantSlug, businesses, children }: { user: { name: string; email: string; role: PlatformRole }; currentTenantSlug: string; businesses: BusinessAccessSummary[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [switchingTenant, setSwitchingTenant] = useState(false);
  const [switchError, setSwitchError] = useState("");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function changeTenant(tenantSlug: string) {
    if (tenantSlug === currentTenantSlug || switchingTenant) return;
    setSwitchingTenant(true);
    setSwitchError("");
    try {
      const response = await fetch("/api/auth/tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantSlug }),
      });
      if (!response.ok) throw new Error();
      router.push(`/t/${tenantSlug}/dashboard`);
      router.refresh();
    } catch {
      setSwitchError("No pudimos abrir ese negocio. Verifica que tu acceso siga activo.");
      setSwitchingTenant(false);
    }
  }

  const sidebar = <>
    <div className="platform-sidebar__brand">
      <Link href="/platform/dashboard" className="brand-mark" aria-label={`${APP_NAME}: consola de plataforma`}><Image src={APP_LOGO} alt={APP_NAME} width={40} height={40} priority /></Link>
      <div><strong>{APP_NAME}</strong><span><ShieldCheck size={12} /> Centro de control</span></div>
      <button className="icon-button mobile-only" onClick={() => setMobileOpen(false)} aria-label="Cerrar navegación"><X size={17} /></button>
    </div>
    <div className="platform-sidebar__scope"><BarChart3 size={16} /><span><small>ALCANCE</small><strong>Toda la plataforma</strong></span></div>
    <nav className="platform-sidebar__nav" aria-label="Administración global">
      <span className="platform-sidebar__label">GESTIÓN</span>
      {navigation.filter((item) => canAccessPlatformSection(user.role, item.path)).map((item) => { const Icon = item.icon; const active = pathname === `/platform/${item.path}` || (pathname === "/platform" && item.path === "dashboard"); return <Link key={item.path} aria-label={item.label} title={item.label} aria-current={active ? "page" : undefined} href={`/platform/${item.path}`} className={cn("platform-sidebar__item", active && "platform-sidebar__item--active")} onClick={() => setMobileOpen(false)}><Icon size={17} /><span><strong>{item.label}</strong><small>{item.description}</small></span></Link>; })}
    </nav>
    <div className="platform-sidebar__return"><label className="platform-business-switcher" title="Entrar a un negocio"><Building2 size={15} /><span><small>ENTRAR A UN NEGOCIO</small><Select value={currentTenantSlug} disabled={switchingTenant} onChange={(event) => void changeTenant(event.target.value)} aria-label="Seleccionar negocio">{businesses.map((business) => <option value={business.slug} key={business.slug}>{business.name}</option>)}</Select></span></label><ThemeToggle /></div>
    <div className="platform-sidebar__footer"><div className="avatar">{initials(user.name)}</div><span><strong>{user.name}</strong><small>{user.email}</small></span><button className="icon-button" onClick={logout} aria-label="Cerrar sesión"><LogOut size={16} /></button></div>
  </>;

  return <div className={cn("platform-shell", collapsed && "platform-shell--collapsed")}>
    <aside
      className="platform-sidebar desktop-sidebar"
      onMouseEnter={() => setCollapsed(false)}
      onMouseMove={() => { if (collapsed) setCollapsed(false); }}
      onMouseLeave={() => setCollapsed(true)}
      onFocus={(event) => {
        if ((event.target as HTMLElement).matches(":focus-visible")) setCollapsed(false);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setCollapsed(true);
      }}
      aria-label="Navegación de administración global"
    >{sidebar}</aside>
    {mobileOpen ? <div className="mobile-backdrop" onMouseDown={() => setMobileOpen(false)}><aside className="platform-sidebar platform-sidebar--mobile" onMouseDown={(event) => event.stopPropagation()}>{sidebar}</aside></div> : null}
    <button className="mobile-menu-trigger mobile-only" onClick={() => setMobileOpen(true)} aria-label="Abrir navegación"><Menu size={20} /></button>
    <main className="platform-main">{children}</main>
    {switchError ? <div className="inline-toast inline-toast--error" role="alert">{switchError}</div> : null}
  </div>;
}
