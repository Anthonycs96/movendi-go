"use client";

import { Link2, Pencil, Truck } from "lucide-react";
import type { TransportData } from "@movendi/contracts";
import { Card, DataTable, Field, Input, OperationForm, PageHeader, Select } from "@/shared/components/ui";
import { formatShortDate } from "@/shared/lib/format";
import { Badge } from "./transport-ui";

function dateInput(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function optionalValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" && value.trim() ? value : undefined;
}

function vehiclePayload(form: FormData, editing = false) {
  return {
    plate: form.get("plate"),
    brand: form.get("brand"),
    model: form.get("model"),
    year: form.get("year"),
    type: form.get("type"),
    capacityKg: optionalValue(form, "capacityKg"),
    odometerKm: form.get("odometerKm"),
    technicalDueAt: optionalValue(form, "technicalDueAt"),
    soatDueAt: optionalValue(form, "soatDueAt"),
    gpsDeviceId: optionalValue(form, "gpsDeviceId"),
    ...(editing ? { status: form.get("status"), active: form.get("active") } : {}),
  };
}

function trailerPayload(form: FormData, editing = false) {
  return {
    plate: form.get("plate"),
    brand: optionalValue(form, "brand"),
    model: optionalValue(form, "model"),
    type: form.get("type"),
    capacityKg: optionalValue(form, "capacityKg"),
    ...(editing ? { status: form.get("status"), active: form.get("active") } : {}),
  };
}

export function Fleet({ data }: { data: TransportData }) {
  const vehicleTypes = data.configuration.fleet.vehicleTypes.filter((item) => item.active);
  const trailerTypes = data.configuration.fleet.trailerTypes.filter((item) => item.active);
  const vehicleStatuses = data.configuration.fleet.vehicleStatuses.filter((item) => item.active);
  const couplingCandidates = data.trailers.filter((item) => item.active && !item.fixedCoupling);

  return <>
    <PageHeader
      eyebrow="ACTIVOS"
      title="Flota operativa"
      description="Disponibilidad, vigencias, capacidad y kilometraje de unidades. Edita cada registro desde su fila."
      icon={Truck}
      actions={<>
        <OperationForm title="Registrar vehículo" endpoint="/api/operations/transport/vehicles" triggerLabel="Vehículo" transform={(form) => vehiclePayload(form)}>
          <Field label="Placa"><Input name="plate" required /></Field>
          <Field label="Marca"><Input name="brand" required /></Field>
          <Field label="Modelo"><Input name="model" required /></Field>
          <Field label="Año"><Input name="year" type="number" defaultValue={new Date().getFullYear()} required /></Field>
          <Field label="Tipo"><Select name="type" required defaultValue=""><option value="" disabled>Selecciona</option>{vehicleTypes.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></Field>
          <Field label={`Capacidad ${data.configuration.general.weightUnit.toLowerCase()}`}><Input name="capacityKg" type="number" min="0.1" step="0.1" /></Field>
          <Field label={`Odómetro ${data.configuration.general.distanceUnit.toLowerCase()}`}><Input name="odometerKm" type="number" min="0" step="0.1" defaultValue="0" required /></Field>
          <Field label="Revisión técnica"><Input name="technicalDueAt" type="date" /></Field>
          <Field label="SOAT"><Input name="soatDueAt" type="date" /></Field>
          <Field label="GPS"><Input name="gpsDeviceId" /></Field>
        </OperationForm>
        <OperationForm title="Registrar carretas inseparables" description="Agrupa dos o tres placas que físicamente siempre trabajan juntas. Cada carreta conservará sus documentos y vencimientos independientes." endpoint="/api/operations/transport/trailer-couplings" triggerLabel="Carretas inseparables" triggerIcon={<Link2 size={16} />} transform={(form) => ({ name: form.get("name"), trailerIds: [form.get("trailerId"), form.get("trailerId2"), form.get("trailerId3")].filter(Boolean) })}>
          <Field label="Nombre del conjunto"><Input name="name" required placeholder="Ej. Bitrén fijo B-12" /></Field>
          <Field label="Primera placa"><Select name="trailerId" required defaultValue=""><option value="" disabled>Busca y selecciona</option>{couplingCandidates.map((item) => <option key={item.id} value={item.id}>{item.plate} · {[item.brand, item.model, item.type].filter(Boolean).join(" ")}</option>)}</Select></Field>
          <Field label="Segunda placa"><Select name="trailerId2" required defaultValue=""><option value="" disabled>Busca y selecciona</option>{couplingCandidates.map((item) => <option key={item.id} value={item.id}>{item.plate} · {[item.brand, item.model, item.type].filter(Boolean).join(" ")}</option>)}</Select></Field>
          <Field label="Tercera placa (opcional)"><Select name="trailerId3" defaultValue=""><option value="">Sin tercera placa</option>{couplingCandidates.map((item) => <option key={item.id} value={item.id}>{item.plate} · {[item.brand, item.model, item.type].filter(Boolean).join(" ")}</option>)}</Select></Field>
        </OperationForm>
        <OperationForm title="Registrar remolque" endpoint="/api/operations/transport/trailers" triggerLabel="Remolque" transform={(form) => trailerPayload(form)}>
          <Field label="Placa"><Input name="plate" required /></Field>
          <Field label="Marca"><Input name="brand" /></Field>
          <Field label="Modelo"><Input name="model" /></Field>
          <Field label="Tipo"><Select name="type" required defaultValue=""><option value="" disabled>Selecciona</option>{trailerTypes.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></Field>
          <Field label={`Capacidad ${data.configuration.general.weightUnit.toLowerCase()}`}><Input name="capacityKg" type="number" min="0.1" step="0.1" /></Field>
        </OperationForm>
      </>}
    />
    <div className="management-grid">
      <Card className="table-card">
        <div className="management-heading"><h2>Vehículos</h2></div>
        <DataTable rows={data.vehicles} rowKey={(row) => row.id} columns={[
          { key: "plate", header: "Unidad", cell: (row) => <span className="table-primary"><strong>{row.plate}</strong><span>{row.brand} {row.model} · {row.year}</span></span> },
          { key: "type", header: "Tipo", cell: (row) => row.type },
          { key: "odometer", header: "Kilometraje", align: "right", cell: (row) => `${row.odometerKm.toLocaleString("es-PE")} km` },
          { key: "status", header: "Estado", cell: (row) => <Badge value={row.active ? row.status : "INACTIVE"} /> },
          { key: "due", header: "Vigencias", cell: (row) => <span className="table-primary"><strong>SOAT: {row.soatDueAt ? formatShortDate(row.soatDueAt, true) : "—"}</strong><span>Técnica: {row.technicalDueAt ? formatShortDate(row.technicalDueAt, true) : "—"}</span></span> },
          { key: "actions", header: "Gestión", sortable: false, cell: (row) => <OperationForm title={`Editar vehículo ${row.plate}`} description="El odómetro solo puede aumentar. Los cambios quedan registrados en auditoría." endpoint={`/api/operations/transport/vehicles/${row.id}`} method="PATCH" triggerLabel="Editar" triggerIcon={<Pencil size={14} />} triggerVariant="secondary" triggerSize="sm" submitLabel="Actualizar" transform={(form) => vehiclePayload(form, true)}>
            <Field label="Placa"><Input name="plate" defaultValue={row.plate} required /></Field>
            <Field label="Marca"><Input name="brand" defaultValue={row.brand} required /></Field>
            <Field label="Modelo"><Input name="model" defaultValue={row.model} required /></Field>
            <Field label="Año"><Input name="year" type="number" min="1980" max={new Date().getFullYear() + 1} defaultValue={row.year} required /></Field>
            <Field label="Tipo"><Select name="type" defaultValue={row.type} required>{vehicleTypes.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></Field>
            <Field label={`Capacidad ${data.configuration.general.weightUnit.toLowerCase()}`}><Input name="capacityKg" type="number" min="0.1" step="0.1" defaultValue={row.capacityKg ?? ""} /></Field>
            <Field label={`Odómetro ${data.configuration.general.distanceUnit.toLowerCase()}`}><Input name="odometerKm" type="number" min={row.odometerKm} step="0.1" defaultValue={row.odometerKm} required /></Field>
            <Field label="Estado operativo"><Select name="status" defaultValue={row.status}>{vehicleStatuses.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></Field>
            <Field label="Registro"><Select name="active" defaultValue={String(row.active)}><option value="true">Activo</option><option value="false">Inactivo</option></Select></Field>
            <Field label="Revisión técnica"><Input name="technicalDueAt" type="date" defaultValue={dateInput(row.technicalDueAt)} /></Field>
            <Field label="SOAT"><Input name="soatDueAt" type="date" defaultValue={dateInput(row.soatDueAt)} /></Field>
            <Field label="GPS"><Input name="gpsDeviceId" defaultValue={row.gpsDeviceId ?? ""} /></Field>
          </OperationForm> },
        ]} />
      </Card>
      <Card className="table-card">
        <div className="management-heading"><h2>Remolques</h2></div>
        <DataTable rows={data.trailers} rowKey={(row) => row.id} columns={[
          { key: "plate", header: "Placa", cell: (row) => <strong>{row.plate}</strong> },
          { key: "type", header: "Tipo", cell: (row) => row.type },
          { key: "coupling", header: "Conjunto físico", cell: (row) => row.fixedCoupling ? <span className="table-primary"><strong>{row.fixedCoupling.name}</strong><span>Inseparable</span></span> : "Individual" },
          { key: "capacity", header: "Capacidad", cell: (row) => row.capacityKg ? `${row.capacityKg.toLocaleString("es-PE")} kg` : "—" },
          { key: "status", header: "Estado", cell: (row) => <Badge value={row.active ? row.status : "INACTIVE"} /> },
          { key: "actions", header: "Gestión", sortable: false, cell: (row) => <OperationForm title={`Editar remolque ${row.plate}`} endpoint={`/api/operations/transport/trailers/${row.id}`} method="PATCH" triggerLabel="Editar" triggerIcon={<Pencil size={14} />} triggerVariant="secondary" triggerSize="sm" submitLabel="Actualizar" transform={(form) => trailerPayload(form, true)}>
            <Field label="Placa"><Input name="plate" defaultValue={row.plate} required /></Field>
            <Field label="Marca"><Input name="brand" defaultValue={row.brand ?? ""} /></Field>
            <Field label="Modelo"><Input name="model" defaultValue={row.model ?? ""} /></Field>
            <Field label="Tipo"><Select name="type" defaultValue={row.type} required>{trailerTypes.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></Field>
            <Field label={`Capacidad ${data.configuration.general.weightUnit.toLowerCase()}`}><Input name="capacityKg" type="number" min="0.1" step="0.1" defaultValue={row.capacityKg ?? ""} /></Field>
            <Field label="Estado operativo"><Select name="status" defaultValue={row.status}>{vehicleStatuses.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></Field>
            <Field label="Registro"><Select name="active" defaultValue={String(row.active)}><option value="true">Activo</option><option value="false">Inactivo</option></Select></Field>
          </OperationForm> },
        ]} />
      </Card>
    </div>
  </>;
}
