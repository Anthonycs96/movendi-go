"use client";

import { navigateWithFreshSession } from "@/shared/lib/session-navigation";

import Image from "next/image";
import { NavigationLink as Link } from "@/shared/components/layout/NavigationLink";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, PanelLeftClose, PanelLeftOpen, CalendarDays, CookingPot, CreditCard,
  LayoutDashboard, LayoutGrid, LogOut, Menu, ReceiptText, Scissors, Search,
  Settings, ShieldCheck, Store, Users, UtensilsCrossed, X, Route, Truck, UserRoundCheck,
  Fuel, Wrench, CircleGauge, ChartNoAxesCombined, BadgePercent, PackageSearch,
} from "lucide-react";
import type { BusinessModuleManifest, IconKey } from "@/core/modules/types";
import type { AuthSessionView, OperationalNotification, OperationalNotificationsResponse } from "@movendi/contracts";
import { can } from "@/core/rbac/permissions";
import { cn } from "@/shared/lib/cn";
import { initials } from "@/shared/lib/format";
import { APP_LOGO, APP_NAME } from "@/shared/config/brand";
import { NotificationMenu } from "./NotificationMenu";
import { ThemeToggle } from "./ThemeToggle";
import { Select } from "@/shared/components/ui";

const icons = {
  dashboard: LayoutDashboard, calendar: CalendarDays, scissors: Scissors, team: Users,
  customers: Users, cash: CreditCard, floor: LayoutGrid, menu: UtensilsCrossed,
  orders: ReceiptText, kitchen: CookingPot, settings: Settings,
  route: Route, truck: Truck, driver: UserRoundCheck, shield: ShieldCheck,
  fuel: Fuel, wrench: Wrench, tire: CircleGauge, reports: ChartNoAxesCombined, discount: BadgePercent, inventory: PackageSearch,
} satisfies Record<IconKey, typeof LayoutDashboard>;

const groupLabels = { overview: "Panel", operations: "Operación", commerce: "Servicios y caja", system: "Sistema" };

export function AppShell({ session, branches, manifest, children }: { session: AuthSessionView; branches: Array<{ id: string; name: string }>; manifest: BusinessModuleManifest; children: React.ReactNode }) {
  useEffect(() => { document.documentElement.lang = session.tenantLocale; document.documentElement.dataset.locale = session.tenantLocale; document.documentElement.dataset.currency = session.tenantCurrency; }, [session.tenantCurrency, session.tenantLocale]);
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [notifications, setNotifications] = useState<OperationalNotification[]>([]);
  const [notificationsStatus, setNotificationsStatus] = useState<"loading" | "ready" | "error">("loading");
  const [branchId, setBranchId] = useState(session.branchId);
  const [switchingBranch, setSwitchingBranch] = useState(false);
  const [shellError, setShellError] = useState("");

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!shellError) return;
    const timer = window.setTimeout(() => setShellError(""), 4500);
    return () => window.clearTimeout(timer);
  }, [shellError]);

  const loadNotifications = useCallback(async () => {
    setNotificationsStatus("loading");
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const payload = await response.json() as OperationalNotificationsResponse;
      setNotifications(payload.items);
      setNotificationsStatus("ready");
    } catch {
      setNotificationsStatus("error");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadNotifications(), 0);
    return () => window.clearTimeout(timer);
  }, [loadNotifications]);

  const moduleEnabled = useCallback((path: string) => !session.enabledModules.length || session.enabledModules.includes(path), [session.enabledModules]);
  const groups = useMemo(() => (["overview", "operations", "commerce", "system"] as const).map((group) => ({
    group, items: manifest.navigation.filter((item) => item.group === group && moduleEnabled(item.path) && can(session.permissions, item.permission)),
  })).filter((group) => group.items.length), [manifest.navigation, moduleEnabled, session.permissions]);

  const commandItems = manifest.navigation.filter((item) => {
    if (!moduleEnabled(item.path) || !can(session.permissions, item.permission)) return false;
    const haystack = `${item.label} ${item.description}`.toLocaleLowerCase("es");
    return haystack.includes(commandQuery.trim().toLocaleLowerCase("es"));
  });
  const mobileItems = manifest.navigation
    .filter((item) => item.group !== "system" && moduleEnabled(item.path) && can(session.permissions, item.permission))
    .slice(0, 4);

  async function changeBranch(value: string) {
    setBranchId(value);
    setSwitchingBranch(true);
    setShellError("");
    try {
      const response = await fetch("/api/auth/branch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ branchId: value }) });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setBranchId(session.branchId);
      setShellError("No pudimos cambiar de sucursal. Inténtalo nuevamente.");
    } finally {
      setSwitchingBranch(false);
    }
  }

  async function logout() {
    setShellError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      navigateWithFreshSession("/login", true);
    } catch {
      setShellError("No pudimos cerrar la sesión. Revisa tu conexión.");
    }
  }

  const sidebar = <>
    <div className="sidebar__brand">
      <Link href={`/t/${session.tenantSlug}/${manifest.navigation.find((item) => can(session.permissions, item.permission) && session.enabledModules.includes(item.path))?.path ?? manifest.defaultPath}`} className="brand-mark" aria-label={`${APP_NAME}: ir al resumen`}><Image src={APP_LOGO} alt={APP_NAME} width={40} height={40} priority /></Link>
      <div className="sidebar__brand-copy"><strong>{session.tenantShortName}</strong><span>{manifest.name}</span></div>
      <button className="sidebar__collapse desktop-only" type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expandir navegación" : "Contraer navegación"} title={collapsed ? "Expandir navegación" : "Contraer navegación"} aria-expanded={!collapsed}>{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
      <button className="sidebar__collapse mobile-only" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú"><X size={17} /></button>
    </div>
    <div className="sidebar__hairline" />
    <nav className="sidebar__nav">{groups.map(({ group, items }) => <div className="sidebar__group" key={group}><span className="sidebar__group-title">{groupLabels[group]}</span>{items.map((item) => { const Icon = icons[item.icon]; const active = pathname.endsWith(`/${item.path}`); return <Link href={`/t/${session.tenantSlug}/${item.path}`} key={item.id} className={cn("sidebar__item", active && "sidebar__item--active")} title={collapsed ? item.label : undefined} onClick={() => setMobileOpen(false)}><Icon size={18} /><span><b>{item.label}</b><small>{item.description}</small></span>{active ? <i /> : null}</Link>; })}</div>)}</nav>
    {session.platformRole === "SUPER_ADMIN" ? <div className="sidebar__platform-link"><Link href="/platform/dashboard"><ShieldCheck size={16} /><span><strong>Centro de control</strong><small>Administración global</small></span></Link></div> : null}
    <div className="sidebar__utilities">
      <button className="sidebar__search" aria-label="Buscar en la aplicación" onClick={() => { setCommandQuery(""); setCommandOpen(true); }}><Search size={16} /><span>Buscar</span><kbd>Ctrl K</kbd></button>
      {branches.length > 1 ? <label className="compact-select branch-select"><Store size={15} /><Select value={branchId} disabled={switchingBranch} onChange={(event) => changeBranch(event.target.value)} aria-label="Sucursal">{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</Select></label> : null}
      <div className="sidebar__utility-actions"><ThemeToggle /><NotificationMenu items={notifications} status={notificationsStatus} onRefresh={loadNotifications} /></div>
    </div>
    <div className="sidebar__footer"><Link href={`/t/${session.tenantSlug}/profile`} className="sidebar__profile" onClick={() => setMobileOpen(false)} aria-label="Abrir mi perfil"><div className="avatar">{initials(session.userName)}</div><div className="sidebar__user"><strong>{session.userName}</strong><span>{session.roleName}</span></div></Link><button className="sidebar__logout" onClick={logout} aria-label="Cerrar sesión"><LogOut size={15} /><span>Salir</span></button></div>
  </>;

  return <div className={cn("app-shell", collapsed && "app-shell--collapsed")}>
    <aside
      className="sidebar desktop-sidebar"
      aria-label="Navegación principal"
    >{sidebar}</aside>
    {mobileOpen ? <div className="mobile-backdrop" onMouseDown={() => setMobileOpen(false)}><aside className="sidebar mobile-sidebar" onMouseDown={(event) => event.stopPropagation()}>{sidebar}</aside></div> : null}
    <div className="app-main"><button className="mobile-menu-trigger mobile-only" onClick={() => setMobileOpen(true)} aria-label="Abrir navegación"><Menu size={20} /></button><main className="app-content">{children}</main></div>
    <nav className="mobile-bottom-nav" aria-label="Navegación móvil">
      {mobileItems.map((item) => {
        const Icon = icons[item.icon];
        const active = pathname.endsWith(`/${item.path}`);
        return <Link href={`/t/${session.tenantSlug}/${item.path}`} key={item.id} className={cn(active && "active")} aria-current={active ? "page" : undefined}><Icon size={18} /><span>{item.label}</span></Link>;
      })}
      <button type="button" onClick={() => setMobileOpen(true)} aria-label="Abrir menú completo"><Menu size={19} /><span>Menú</span></button>
    </nav>
    {shellError ? <div className="inline-toast inline-toast--error" role="alert"><AlertCircle size={17} />{shellError}</div> : null}
    {commandOpen ? <div className="command-backdrop" onMouseDown={() => setCommandOpen(false)}><section className="command" role="dialog" aria-modal="true" aria-label="Buscar en la aplicación" onMouseDown={(event) => event.stopPropagation()}><header><Search size={18} /><input autoFocus value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder="Buscar página o acción…" /><kbd>ESC</kbd></header><div><span className="command__label">Ir a</span>{commandItems.slice(0, 7).map((item) => { const Icon = icons[item.icon]; return <Link href={`/t/${session.tenantSlug}/${item.path}`} onClick={() => setCommandOpen(false)} key={item.id}><Icon size={17} /><span><b>{item.label}</b><small>{item.description}</small></span><em>↵</em></Link>; })}{!commandItems.length ? <p className="command__empty">No encontramos una sección con ese nombre.</p> : null}</div></section></div> : null}
  </div>;
}
