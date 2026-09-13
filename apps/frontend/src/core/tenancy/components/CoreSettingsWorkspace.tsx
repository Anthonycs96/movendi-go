"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Building2,
  Globe2,
  KeyRound,
  Landmark,
  ShieldCheck,
  Users,
} from "lucide-react";
import { nextAutomaticRoleKey, type CoreTenantData } from "@movendi/contracts";
import {
  Card,
  DataTable,
  Field,
  Input,
  OperationForm,
  PageHeader,
  Select,
  StatusBadge,
} from "@/shared/components/ui";
import { formatDateTime } from "@/shared/lib/format";
import { localizeCode } from "@/shared/lib/localization";

type PermissionOption = { value: string; label: string; group: string };

const commonPermissions: PermissionOption[] = [
  {
    value: "dashboard:read",
    label: "Ver el resumen del negocio",
    group: "General",
  },
  { value: "customers:read", label: "Ver clientes", group: "Clientes" },
  {
    value: "customers:write",
    label: "Crear y editar clientes",
    group: "Clientes",
  },
  {
    value: "settings:write",
    label: "Administrar configuración, usuarios y roles",
    group: "Administración",
  },
  { value: "inventory:read", label: "Ver stock, Kardex y alertas", group: "Inventario" },
  { value: "inventory:write", label: "Administrar compras, movimientos, conteos y recetas", group: "Inventario" },
];

const industryPermissions: Record<string, PermissionOption[]> = {
  MINIMARKET: [["minimarket:catalog:read", "Ver catálogo"], ["minimarket:catalog:write", "Administrar catálogo"], ["minimarket:sales:read", "Ver ventas"], ["minimarket:sales:write", "Cobrar ventas"], ["minimarket:refunds:write", "Devolver ventas"], ["minimarket:cash:write", "Operar caja"], ["minimarket:cash:approve", "Aprobar diferencias de caja"], ["minimarket:reports:read", "Ver resultados"]].map(([value, label]) => ({ value, label, group: "Minimarket" })),
  BARBERSHOP: [
    {
      value: "barbershop:appointments:read",
      label: "Ver agenda y citas",
      group: "Operación",
    },
    {
      value: "barbershop:appointments:write",
      label: "Crear y modificar citas",
      group: "Operación",
    },
    {
      value: "barbershop:team:read",
      label: "Ver equipo y horarios",
      group: "Equipo",
    },
    {
      value: "barbershop:team:write",
      label: "Administrar equipo y horarios",
      group: "Equipo",
    },
    {
      value: "services:read",
      label: "Ver servicios y precios",
      group: "Servicios",
    },
    {
      value: "services:write",
      label: "Administrar servicios y precios",
      group: "Servicios",
    },
    {
      value: "barbershop:cash:write",
      label: "Operar caja y ventas",
      group: "Caja",
    },
  ],
  RESTAURANT: [
    {
      value: "restaurant:floor:read",
      label: "Ver salón y mesas",
      group: "Salón",
    },
    {
      value: "restaurant:floor:write",
      label: "Administrar salón y mesas",
      group: "Salón",
    },
    { value: "restaurant:orders:read", label: "Ver pedidos", group: "Pedidos" },
    {
      value: "restaurant:orders:write",
      label: "Crear y modificar pedidos",
      group: "Pedidos",
    },
    {
      value: "restaurant:kitchen:read",
      label: "Ver comandas de cocina",
      group: "Cocina",
    },
    {
      value: "restaurant:kitchen:write",
      label: "Actualizar comandas de cocina",
      group: "Cocina",
    },
    { value: "restaurant:menu:read", label: "Ver carta", group: "Carta" },
    { value: "restaurant:menu:write", label: "Administrar carta", group: "Carta" },
    { value: "restaurant:menu-history:read", label: "Ver historial de carta y descargar PDF", group: "Carta" },
    { value: "restaurant:menu-history:revert", label: "Revertir cambios de carta (requiere administrar carta y ver historial)", group: "Carta" },
    { value: "restaurant:promotions:read", label: "Ver promociones", group: "Promociones" },
    { value: "restaurant:promotions:write", label: "Administrar promociones", group: "Promociones" },
    { value: "restaurant:promotions:approve", label: "Aprobar descuentos excepcionales", group: "Promociones" },
    { value: "restaurant:reports:read", label: "Ver reportes y rentabilidad", group: "Reportes" },
    { value: "restaurant:staff:read", label: "Ver actividad del personal (en Salón)", group: "Supervisión" },
    { value: "restaurant:printing:read", label: "Ver rutas e impresoras", group: "Impresión" },
    { value: "restaurant:printing:write", label: "Administrar áreas, rutas e impresoras", group: "Impresión" },
    { value: "restaurant:configuration:read", label: "Ver configuración operativa", group: "Configuración" },
    { value: "restaurant:configuration:write", label: "Administrar configuración operativa", group: "Configuración" },
    { value: "restaurant:sunat:read", label: "Ver comprobantes electrónicos", group: "SUNAT" },
    { value: "restaurant:sunat:write", label: "Configurar y emitir comprobantes", group: "SUNAT" },
    { value: "restaurant:read", label: "Acceso de lectura anterior (compatibilidad)", group: "Compatibilidad" },
    { value: "restaurant:write", label: "Acceso de edición anterior (compatibilidad)", group: "Compatibilidad" },
    {
      value: "restaurant:cash:write",
      label: "Operar caja y cobros",
      group: "Caja",
    },
    { value: "restaurant:cash:approve", label: "Aprobar retiros y diferencias de caja", group: "Caja" },
  ],
  TRANSPORT: [
    ...[
      "operations",
      "fleet",
      "drivers",
      "documents",
      "finance",
      "fuel",
      "maintenance",
      "tires",
      "masters",
    ].flatMap((area) => {
      const names: Record<string, string> = {
        operations: "viajes y seguimiento",
        fleet: "flota",
        drivers: "conductores",
        documents: "documentos",
        finance: "finanzas",
        fuel: "combustible",
        maintenance: "mantenimiento",
        tires: "neumáticos",
        masters: "maestros operativos",
      };
      return [
        {
          value: `transport:${area}:read`,
          label: `Ver ${names[area]}`,
          group: "Transporte",
        },
        {
          value: `transport:${area}:write`,
          label: `Administrar ${names[area]}`,
          group: "Transporte",
        },
      ];
    }),
  ],
};

function rolePayload(form: FormData) {
  return {
    key: form.get("key"),
    name: form.get("name"),
    permissions: form.getAll("permissions").join(","),
  };
}

function PublicSiteForm({ tenant }: { tenant: CoreTenantData["tenant"] }) {
  return <OperationForm
    title="Sitio web público"
    description="Publica una página sincronizada con los productos o servicios activos de tu empresa."
    endpoint="/api/operations/core/public-site"
    method="PATCH"
    triggerLabel={tenant.publicSitePublished ? "Editar sitio" : "Configurar y publicar"}
    submitLabel="Guardar sitio"
    transform={(form) => ({ published: form.get("published") === "on", headline: form.get("headline"), description: form.get("description"), primaryColor: form.get("primaryColor"), whatsapp: form.get("whatsapp"), instagram: form.get("instagram") })}
  >
    <Field label="Título principal"><Input name="headline" defaultValue={tenant.publicSiteHeadline ?? ""} placeholder={`Bienvenido a ${tenant.shortName}`} /></Field>
    <Field label="Color de marca"><Input name="primaryColor" type="color" defaultValue={tenant.publicSitePrimaryColor} /></Field>
    <label className="field form-span"><span>Descripción</span><textarea className="input platform-textarea" name="description" defaultValue={tenant.publicSiteDescription ?? ""} placeholder="Cuenta brevemente qué hace especial a tu empresa." /></label>
    <Field label="WhatsApp"><Input name="whatsapp" defaultValue={tenant.publicSiteWhatsapp ?? ""} placeholder="51987654321" /></Field>
    <Field label="Instagram"><Input name="instagram" defaultValue={tenant.publicSiteInstagram ?? ""} placeholder="usuario o enlace" /></Field>
    <label className="platform-check form-span"><input name="published" type="checkbox" defaultChecked={tenant.publicSitePublished} /><span><strong>Publicar sitio web</strong><small>Será visible en /site/{tenant.slug}</small></span></label>
  </OperationForm>;
}

function PermissionSelector({
  tenantType,
  selected = [],
  admin = false,
}: {
  tenantType: string;
  selected?: string[];
  admin?: boolean;
}) {
  if (admin)
    return (
      <div className="permission-admin-note">
        <ShieldCheck size={18} />
        <span>
          <strong>Acceso total protegido</strong>
          <small>
            El rol Administrador conserva automáticamente todas las funciones.
          </small>
        </span>
        <input type="hidden" name="permissions" value="*" />
      </div>
    );
  const options = [
    ...commonPermissions,
    ...(industryPermissions[tenantType] ?? []),
  ];
  return (
    <fieldset className="permission-selector form-span">
      <legend>¿Qué podrá hacer este rol?</legend>
      <div>
        {options.map((option) => (
          <label key={option.value}>
            <input
              type="checkbox"
              name="permissions"
              value={option.value}
              defaultChecked={selected.includes(option.value)}
            />
            <span>
              <strong>{option.label}</strong>
              <small>{option.group}</small>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CoreSettingsWorkspace({
  core,
  title = "Configuración",
  description,
  extraActions,
  extraCards,
  platformAdmin = false,
}: {
  core: CoreTenantData;
  title?: string;
  description?: string;
  extraActions?: ReactNode;
  extraCards?: ReactNode;
  platformAdmin?: boolean;
}) {
  return (
    <>
      <PageHeader
        eyebrow="Administración"
        title={title}
        description={
          description ??
          `${core.tenant.name}: perfil, sucursales, usuarios, roles, seguridad y auditoría.`
        }
      />
      <Card className="settings-actions" aria-label="Acciones de configuración">
        {extraActions}
        {platformAdmin ? (
          <Link
            className="button button--secondary button--md"
            href="/platform/dashboard"
          >
            Abrir centro de control
          </Link>
        ) : null}
        <OperationForm
          title="Perfil empresarial"
          endpoint="/api/operations/core/tenant"
          method="PATCH"
          triggerLabel="Datos de la empresa"
          submitLabel="Actualizar"
        >
          <Field label="Razón comercial">
            <Input name="name" defaultValue={core.tenant.name} required />
          </Field>
          <Field label="Nombre corto">
            <Input
              name="shortName"
              defaultValue={core.tenant.shortName}
              required
            />
          </Field>
          <Field label="Correo">
            <Input
              name="email"
              type="email"
              defaultValue={core.tenant.email ?? ""}
            />
          </Field>
          <Field label="Teléfono">
            <Input name="phone" defaultValue={core.tenant.phone ?? ""} />
          </Field>
          <Field label="Dirección">
            <Input name="address" defaultValue={core.tenant.address ?? ""} />
          </Field>
          <Field label="Moneda">
            <Select name="currency" defaultValue={core.tenant.currency}>
              <option value="PEN">PEN · Soles</option>
              <option value="USD">USD · Dólares</option>
            </Select>
          </Field>
          <Field label="Idioma y región">
            <Select name="locale" defaultValue={core.tenant.locale}>
              <option value="es-PE">Español · Perú</option>
              <option value="es-ES">Español · Internacional</option>
              <option value="en-US">English · United States</option>
            </Select>
          </Field>
        </OperationForm>
        <OperationForm
          title="Cambiar contraseña"
          description="Se cerrarán las demás sesiones activas de tu usuario."
          endpoint="/api/auth/change-password"
          triggerLabel="Seguridad"
          submitLabel="Actualizar contraseña"
        >
          <Field label="Contraseña actual">
            <Input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label="Nueva contraseña">
            <Input
              name="newPassword"
              type="password"
              minLength={8}
              autoComplete="new-password"
              required
            />
          </Field>
        </OperationForm>
        <OperationForm
          title="Nueva sucursal"
          endpoint="/api/operations/core/branches"
          triggerLabel="Sucursal"
        >
          <Field label="Nombre">
            <Input name="name" required />
          </Field>
          <Field label="Dirección">
            <Input name="address" />
          </Field>
          <Field label="Teléfono">
            <Input name="phone" />
          </Field>
        </OperationForm>
        <OperationForm
          title="Nuevo usuario"
          endpoint="/api/operations/core/users"
          triggerLabel="Usuario"
        >
          <Field label="Nombre">
            <Input name="name" required />
          </Field>
          <Field label="Correo">
            <Input name="email" type="email" required />
          </Field>
          <Field label="Contraseña temporal">
            <Input name="password" type="password" minLength={8} required />
          </Field>
          <Field label="Rol">
            <Select name="roleId" required defaultValue="">
              <option value="" disabled>
                Selecciona rol
              </option>
              {core.roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sucursal">
            <Select name="branchId" required defaultValue="">
              <option value="" disabled>
                Selecciona sucursal
              </option>
              {core.branches
                .filter((branch) => branch.active)
                .map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
            </Select>
          </Field>
        </OperationForm>
        <OperationForm
          title="Nuevo rol"
          endpoint="/api/operations/core/roles"
          triggerLabel="Rol"
          transform={rolePayload}
        >
          <Field label="Clave automática">
            <Input name="key" value={nextAutomaticRoleKey(core.roles)} readOnly aria-readonly="true" required />
          </Field>
          <Field label="Nombre">
            <Input name="name" placeholder="Recepción" required />
          </Field>
          <PermissionSelector tenantType={core.tenant.type} />
        </OperationForm>
      </Card>
      <section className="settings-grid core-settings-grid">
        {extraCards}
        <Card className="settings-card public-site-settings-card">
          <Globe2 size={21} />
          <div><h3>Sitio web público</h3><p>{core.tenant.publicWebsiteEnabled ? core.tenant.publicSitePublished ? "Publicado y sincronizado con tu operación." : "Incluido en tu plan. Configúralo y publícalo desde aquí." : "Este beneficio no está incluido en el plan actual."}</p></div>
          <div className="public-site-settings-actions">{core.tenant.publicWebsiteEnabled ? <PublicSiteForm tenant={core.tenant} /> : <StatusBadge tone="neutral">No incluido</StatusBadge>}{core.tenant.publicWebsiteEnabled && core.tenant.publicSitePublished ? <Link className="button button--secondary button--sm" href={`/site/${core.tenant.slug}`} target="_blank">Ver sitio</Link> : null}</div>
        </Card>
        <Card className="settings-card">
          <Landmark size={21} />
          <div>
            <h3>{core.tenant.shortName}</h3>
            <p>
              {core.tenant.currency} · {core.tenant.email ?? "Sin correo"}
            </p>
          </div>
          <StatusBadge tone="success">Activa</StatusBadge>
        </Card>
        <Card className="settings-card">
          <Building2 size={21} />
          <div>
            <h3>{core.branches.length} sucursales</h3>
            <p>{core.branches.map((item) => item.name).join(" · ")}</p>
          </div>
          <StatusBadge tone="info">Scope</StatusBadge>
        </Card>
        <Card className="settings-card">
          <Users size={21} />
          <div>
            <h3>{core.users.length} usuarios</h3>
            <p>
              {core.users
                .map((item) => `${item.name} (${item.roleName})`)
                .join(" · ")}
            </p>
          </div>
          <StatusBadge tone="info">RBAC</StatusBadge>
        </Card>
        <Card className="settings-card">
          <ShieldCheck size={21} />
          <div>
            <h3>{core.roles.length} roles</h3>
            <p>
              {core.roles
                .map((item) => `${item.name}: ${item.permissions.join(", ")}`)
                .join(" · ")}
            </p>
          </div>
          <StatusBadge tone="violet">Permisos</StatusBadge>
        </Card>
        <Card className="settings-card">
          <KeyRound size={21} />
          <div>
            <h3>Sesiones protegidas</h3>
            <p>
              Contraseñas con hash bcrypt y revocación de sesiones secundarias.
            </p>
          </div>
          <StatusBadge tone="success">Seguro</StatusBadge>
        </Card>
      </section>
      <section className="management-grid">
        <Card className="table-card">
          <div className="management-heading">
            <div>
              <span className="section-kicker">Organización</span>
              <h2>Sucursales</h2>
            </div>
          </div>
          <DataTable
            rows={core.branches}
            rowKey={(row) => row.id}
            columns={[
              {
                key: "name",
                header: "Sucursal",
                cell: (row) => (
                  <span className="table-primary">
                    <strong>{row.name}</strong>
                    <span>{row.address ?? "Sin dirección"}</span>
                  </span>
                ),
              },
              {
                key: "status",
                header: "Estado",
                cell: (row) => (
                  <StatusBadge tone={row.active ? "success" : "neutral"}>
                    {row.active ? "Activa" : "Inactiva"}
                  </StatusBadge>
                ),
              },
              {
                key: "actions",
                header: "Gestión",
                cell: (row) => (
                  <OperationForm
                    title={`Editar ${row.name}`}
                    endpoint={`/api/operations/core/branches/${row.id}`}
                    method="PATCH"
                    triggerLabel="Editar"
                    submitLabel="Actualizar"
                  >
                    <Field label="Nombre">
                      <Input name="name" defaultValue={row.name} required />
                    </Field>
                    <Field label="Dirección">
                      <Input name="address" defaultValue={row.address ?? ""} />
                    </Field>
                    <Field label="Teléfono">
                      <Input name="phone" defaultValue={row.phone ?? ""} />
                    </Field>
                    <Field label="Estado">
                      <Select name="active" defaultValue={String(row.active)}>
                        <option value="true">Activa</option>
                        <option value="false">Inactiva</option>
                      </Select>
                    </Field>
                  </OperationForm>
                ),
              },
            ]}
          />
        </Card>
        <Card className="table-card">
          <div className="management-heading">
            <div>
              <span className="section-kicker">Accesos</span>
              <h2>Usuarios</h2>
            </div>
          </div>
          <DataTable
            rows={core.users}
            rowKey={(row) => row.membershipId}
            columns={[
              {
                key: "user",
                header: "Usuario",
                sortValue: (row) => row.name,
                cell: (row) => (
                  <span className="table-primary">
                    <strong>{row.name}</strong>
                    <span>{row.email}</span>
                  </span>
                ),
              },
              {
                key: "scope",
                header: "Acceso",
                cell: (row) => (
                  <span className="table-primary">
                    <strong>{row.roleName}</strong>
                    <span>{row.branchName ?? "Sin sede"}</span>
                  </span>
                ),
              },
              {
                key: "status",
                header: "Estado",
                cell: (row) => (
                  <StatusBadge tone={row.active ? "success" : "neutral"}>
                    {row.active ? "Activo" : "Inactivo"}
                  </StatusBadge>
                ),
              },
              {
                key: "actions",
                header: "Gestión",
                cell: (row) => (
                  <div className="table-actions">
                    <OperationForm
                      title={`Editar ${row.name}`}
                      endpoint={`/api/operations/core/users/${row.id}`}
                      method="PATCH"
                      triggerLabel="Editar"
                      submitLabel="Actualizar"
                    >
                      <Field label="Nombre">
                        <Input name="name" defaultValue={row.name} required />
                      </Field>
                      <Field label="Rol">
                        <Select
                          name="roleId"
                          defaultValue={row.roleId}
                          required
                        >
                          {core.roles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Sucursal">
                        <Select
                          name="branchId"
                          defaultValue={row.branchId ?? ""}
                          required
                        >
                          {core.branches
                            .filter((branch) => branch.active)
                            .map((branch) => (
                              <option key={branch.id} value={branch.id}>
                                {branch.name}
                              </option>
                            ))}
                        </Select>
                      </Field>
                      <Field label="Estado">
                        <Select name="active" defaultValue={String(row.active)}>
                          <option value="true">Activo</option>
                          <option value="false">Inactivo</option>
                        </Select>
                      </Field>
                    </OperationForm>
                    {core.canResetPasswords &&
                    row.id !== core.currentActorId &&
                    row.active ? (
                      <OperationForm
                        title={`Restablecer contraseña de ${row.name}`}
                        description="Se cerrarán todas sus sesiones. En el próximo ingreso deberá crear una contraseña personal."
                        endpoint={`/api/operations/core/users/${row.id}/reset-password`}
                        triggerLabel="Restablecer clave"
                        submitLabel="Asignar clave temporal"
                      >
                        <Field label="Contraseña temporal">
                          <Input
                            name="temporaryPassword"
                            type="password"
                            minLength={8}
                            autoComplete="new-password"
                            required
                          />
                        </Field>
                      </OperationForm>
                    ) : null}
                  </div>
                ),
              },
            ]}
          />
        </Card>
      </section>
      <Card className="table-card role-management">
        <div className="management-heading">
          <div>
            <span className="section-kicker">Autorización</span>
            <h2>Roles y permisos</h2>
          </div>
        </div>
        <DataTable
          rows={core.roles}
          rowKey={(row) => row.id}
          columns={[
            {
              key: "role",
              header: "Rol",
              sortValue: (row) => row.name,
              cell: (row) => (
                <span className="table-primary">
                  <strong>{row.name}</strong>
                  <span>{row.key}</span>
                </span>
              ),
            },
            {
              key: "permissions",
              header: "Permisos",
              cell: (row) => row.permissions.join(", "),
            },
            {
              key: "actions",
              header: "Gestión",
              cell: (row) => (
                <OperationForm
                  title={`Editar ${row.name}`}
                  endpoint={`/api/operations/core/roles/${row.id}`}
                  method="PATCH"
                  triggerLabel="Editar"
                  submitLabel="Actualizar"
                  transform={rolePayload}
                >
                  <Field label="Clave automática">
                    <Input
                      name="key"
                      defaultValue={row.key}
                      readOnly
                      aria-readonly="true"
                      required
                    />
                  </Field>
                  <Field label="Nombre">
                    <Input name="name" defaultValue={row.name} required />
                  </Field>
                  <PermissionSelector
                    tenantType={core.tenant.type}
                    selected={row.permissions}
                    admin={row.key === "ADMIN"}
                  />
                </OperationForm>
              ),
            },
          ]}
        />
      </Card>
      <Card className="table-card audit-card">
        <DataTable
          rows={core.audit}
          rowKey={(row) => row.id}
          columns={[
            {
              key: "date",
              header: "Fecha",
              sortValue: (row) => new Date(row.createdAt),
              cell: (row) => formatDateTime(row.createdAt),
            },
            {
              key: "action",
              header: "Acción",
              cell: (row) => (
              <StatusBadge tone="info">{localizeCode(row.action, core.tenant.locale)}</StatusBadge>
              ),
            },
            { key: "entity", header: "Entidad", cell: (row) => row.entityType },
            {
              key: "actor",
              header: "Actor",
              cell: (row) => row.actor ?? "Sistema",
            },
          ]}
        />
      </Card>
    </>
  );
}
