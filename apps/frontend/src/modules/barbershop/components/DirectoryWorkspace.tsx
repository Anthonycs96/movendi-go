"use client";

import { useState } from "react";

import type { BarbershopData } from "../types";
import { Card, DataTable, Field, Input, OperationForm, PageHeader, SearchInput, Select, StatusBadge } from "@/shared/components/ui";
import { initials } from "@/shared/lib/format";
import type { CoreTenantData } from "@movendi/contracts";
import { CoreSettingsWorkspace } from "@/core/tenancy/components/CoreSettingsWorkspace";
import { CustomerHistory } from "./CustomerHistory";
import { PaymentSettings } from "./PaymentSettings";
import { TeamControls } from "./TeamControls"; import { salonCan } from "./salon-ui";



export function DirectoryWorkspace({ section, data, core, platformAdmin = false }: { section: "clients" | "team" | "services" | "checkout" | "settings"; data: BarbershopData; core: CoreTenantData; platformAdmin?: boolean }) {
  const [query, setQuery] = useState("");
  if (section === "team") return <TeamControls data={data} />;

  if (section === "clients") {
    const rows = data.customers.filter((item) => `${item.name} ${item.dni ?? ""} ${item.phone ?? ""} ${item.email ?? ""}`.toLowerCase().includes(query.toLowerCase()));
    return <><PageHeader eyebrow="CRM" title="Clientes" description="Historial y preferencias disponibles para toda la operación del negocio." actions={<OperationForm allowed={salonCan(data, "customers:write")} title="Nuevo cliente" endpoint="/api/operations/barbershop/customers" triggerLabel="Nuevo cliente"><Field label="Nombre completo"><Input name="name" required /></Field><Field label="DNI"><Input name="dni" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} placeholder="8 dígitos" /></Field><Field label="Celular"><Input name="phone" /></Field><Field label="Correo"><Input name="email" type="email" /></Field><Field label="Notas"><Input name="notes" /></Field></OperationForm>} /><Card className="table-card"><div className="filters"><SearchInput value={query} onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery("")} placeholder="Buscar por nombre, teléfono o DNI" /><span className="filter-spacer" /><span className="results-count">{rows.length} clientes</span></div><DataTable rows={rows} rowKey={(row) => row.id} columns={[
      { key: "client", header: "Cliente", sortValue: (row) => row.name, cell: (row) => <div className="person-cell"><div className="mini-avatar">{initials(row.name)}</div><div><strong>{row.name}</strong><small>{row.email ?? "Sin correo"}</small></div></div> },
      { key: "dni", header: "DNI", cell: (row) => row.dni ?? "—" },
      { key: "phone", header: "Celular", cell: (row) => row.phone ?? "—" },
      { key: "notes", header: "Preferencias", cell: (row) => row.notes ?? "Sin notas" },
      { key: "status", header: "Estado", cell: (row) => <StatusBadge tone={row.active ? "success" : "neutral"}>{row.active ? "Activo" : "Inactivo"}</StatusBadge> },
      { key: "history", header: "Historial", cell: (row) => <CustomerHistory customer={row} /> },
      { key: "actions", header: "Gestión", cell: (row) => <OperationForm allowed={salonCan(data, "customers:write")} title={`Editar ${row.name}`} endpoint={`/api/operations/barbershop/customers/${row.id}`} method="PATCH" triggerLabel="Editar" submitLabel="Actualizar"><Field label="Nombre"><Input name="name" defaultValue={row.name} required /></Field><Field label="DNI"><Input name="dni" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} defaultValue={row.dni ?? ""} /></Field><Field label="Celular"><Input name="phone" defaultValue={row.phone ?? ""} /></Field><Field label="Correo"><Input name="email" type="email" defaultValue={row.email ?? ""} /></Field><Field label="Notas"><Input name="notes" defaultValue={row.notes ?? ""} /></Field><Field label="Estado"><Select name="active" defaultValue={String(row.active)}><option value="true">Activo</option><option value="false">Inactivo</option></Select></Field></OperationForm> },
    ]} /></Card></>;
  }

  return <><PaymentSettings data={data} /><CoreSettingsWorkspace core={core} platformAdmin={platformAdmin} /></>;
}
