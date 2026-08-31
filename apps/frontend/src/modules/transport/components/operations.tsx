"use client";

import { Route } from "lucide-react";
import type { TransportData } from "@movendi/contracts";
import { Card, DataTable, Field, Input, OperationButton, OperationForm, PageHeader, Select } from "@/shared/components/ui";
import { formatDateTime } from "@/shared/lib/format";
import { Badge, money, nowInput, futureInput } from "./transport-ui";
function NewOperation({ data }: { data: TransportData }) {
  return <OperationForm title="Registrar operación logística" description="Agrupa uno o varios viajes. Puedes crearla antes de conocer placas, unidades o conductores." endpoint="/api/operations/transport/operations" triggerLabel="Nueva operación" submitLabel="Crear operación">
    <Field label="Nombre de la operación"><Input name="name" required placeholder="Distribución Lima Norte · Semana 35" /></Field>
    <Field label="Cliente"><Select name="customerId" defaultValue=""><option value="">Varios clientes / por definir</option>{data.parties.filter((item) => item.kind === "CUSTOMER" && item.active).map((item) => <option key={item.id} value={item.id}>{item.legalName}</option>)}</Select></Field>
    <Field label="Inicio planificado"><Input name="plannedStartAt" type="datetime-local" defaultValue={futureInput(24)} required /></Field>
    <Field label="Fin planificado"><Input name="plannedEndAt" type="datetime-local" defaultValue={futureInput(72)} required /></Field>
    <Field label="Descripción"><Input name="description" placeholder="Alcance general de la operación" /></Field>
    <Field label="Notas"><Input name="notes" /></Field>
  </OperationForm>;
}
function NewTrip({ data }: { data: TransportData }) {
  return <OperationForm title="Programar viaje" description="La asignación se realiza después para validar jornada, documentos y solapamientos." endpoint="/api/operations/transport/trips" triggerLabel="Nuevo viaje" submitLabel="Programar">
    <Field label="Operación"><Select name="operationId" defaultValue=""><option value="">Sin operación / asignar después</option>{data.operations.filter((item) => ["PLANNED", "IN_PROGRESS"].includes(item.status)).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</Select></Field>
    <Field label="Cliente"><Select name="customerId" required defaultValue=""><option value="" disabled>Selecciona cliente</option>{data.parties.filter((item) => item.kind === "CUSTOMER" && item.active).map((item) => <option key={item.id} value={item.id}>{item.legalName}</option>)}</Select></Field>
    <Field label="Ruta"><Select name="routeId" required defaultValue=""><option value="" disabled>Selecciona ruta</option>{data.routes.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
    <Field label="Tipo de servicio"><Select name="serviceType" required defaultValue=""><option value="" disabled>Selecciona</option>{data.configuration.operations.serviceTypes.filter((item) => item.active).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></Field><Field label="Carga"><Input name="cargoDescription" required placeholder="Abarrotes paletizados" /></Field>
    <Field label={`Peso (${data.configuration.general.weightUnit.toLowerCase()})`}><Input name="cargoWeightKg" type="number" min="0.01" step="0.01" /></Field><Field label="Prioridad"><Select name="priority" defaultValue={data.configuration.operations.priorities.find((item) => item.key === "NORMAL")?.key ?? data.configuration.operations.priorities[0]?.key}>{data.configuration.operations.priorities.filter((item) => item.active).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></Field>
    <Field label="Salida"><Input name="scheduledStartAt" type="datetime-local" defaultValue={futureInput(24)} required /></Field><Field label="Llegada estimada"><Input name="scheduledEndAt" type="datetime-local" defaultValue={futureInput(32)} required /></Field>
    <Field label="Flete (S/)"><Input name="freight" type="number" min="0" step="0.01" required /></Field><Field label="Presupuesto (S/)"><Input name="budget" type="number" min="0" step="0.01" required /></Field>
    <Field label="Referencia"><Input name="referenceNo" /></Field><Field label="Notas"><Input name="notes" /></Field>
  </OperationForm>;
}

function TripActions({ trip, data }: { trip: TransportData["trips"][number]; data: TransportData }) {
  const nextStatuses = data.configuration.operations.tripStatuses.find((item) => item.key === trip.status)?.allowedNext ?? [];
  const statusLabel = (key: string) => data.configuration.operations.tripStatuses.find((item) => item.key === key)?.label ?? key;
  return <div className="table-actions">
    <OperationForm title={`Operación de ${trip.code}`} description="Puedes asociar o mover este viaje sin modificar su unidad ni conductor." endpoint={`/api/operations/transport/trips/${trip.id}/operation`} method="PATCH" triggerLabel={trip.operation ? "Cambiar operación" : "Asignar operación"}>
      <Field label="Operación"><Select name="operationId" defaultValue={trip.operationId ?? ""}><option value="">Sin operación</option>{data.operations.filter((item) => ["PLANNED", "IN_PROGRESS"].includes(item.status) || item.id === trip.operationId).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</Select></Field>
    </OperationForm>
    {trip.status !== "DELIVERED" && trip.status !== "CANCELLED" ? <OperationForm title={`Ensamblar unidad · ${trip.code}`} description="Configura tracto, una carreta, piloto y segundo piloto. Se validan documentos, jornadas y solapamientos de todos los recursos." endpoint={`/api/operations/transport/trips/${trip.id}/assign`} triggerLabel={trip.assignments.some((item) => item.status === "ACTIVE") ? "Reconfigurar" : "Ensamblar"} submitLabel="Confirmar ensamble">
      <Field label="Unidad / tracto"><Select name="vehicleId" required defaultValue=""><option value="" disabled>Selecciona</option>{data.vehicles.filter((item) => item.active && !["MAINTENANCE", "OUT_OF_SERVICE"].includes(item.status)).map((item) => <option key={item.id} value={item.id}>{item.plate} · {item.brand} {item.model}</option>)}</Select></Field>
      <Field label="Carreta"><Select name="trailerId" defaultValue=""><option value="">Sin carreta</option>{data.trailers.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.plate}</option>)}</Select></Field>
      <Field label="Piloto"><Select name="driverId" required defaultValue=""><option value="" disabled>Selecciona</option>{data.drivers.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.scheduleToday}</option>)}</Select></Field>
      <Field label="Segundo piloto"><Select name="secondDriverId" defaultValue=""><option value="">Sin segundo piloto</option>{data.drivers.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.scheduleToday}</option>)}</Select></Field>
      <Field label="Motivo"><Input name="reason" placeholder="Asignación operativa" /></Field>
    </OperationForm> : null}
    {nextStatuses.map((status) => <OperationButton key={status} endpoint={`/api/operations/transport/trips/${trip.id}/status`} body={{ status }} variant={status === "CANCELLED" ? "danger" : "secondary"}>{statusLabel(status)}</OperationButton>)}
    {["ASSIGNED", "IN_TRANSIT"].includes(trip.status) ? <OperationForm title={`Seguimiento ${trip.code}`} endpoint={`/api/operations/transport/trips/${trip.id}/tracking`} triggerLabel="Seguimiento">
      <Field label="Evento"><Select name="type" defaultValue={data.configuration.operations.trackingEvents.find((item) => item.key === "POSITION")?.key ?? data.configuration.operations.trackingEvents[0]?.key}>{data.configuration.operations.trackingEvents.filter((item) => item.active).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></Field><Field label="Fecha"><Input name="recordedAt" type="datetime-local" defaultValue={nowInput()} required /></Field><Field label="Latitud"><Input name="latitude" type="number" step="any" /></Field><Field label="Longitud"><Input name="longitude" type="number" step="any" /></Field><Field label="Odómetro"><Input name="odometerKm" type="number" step="0.1" /></Field><Field label="Descripción"><Input name="description" /></Field>
    </OperationForm> : null}
    {! ["DELIVERED", "CANCELLED"].includes(trip.status) ? <OperationForm title={`Reportar incidente · ${trip.code}`} endpoint={`/api/operations/transport/trips/${trip.id}/incidents`} triggerLabel="Incidente">
      <Field label="Tipo"><Select name="type" defaultValue="" required><option value="" disabled>Selecciona</option>{data.configuration.safety.incidentTypes.filter((item) => item.active).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></Field><Field label="Severidad"><Select name="severity" defaultValue={data.configuration.safety.severities.find((item) => item.key === "MEDIUM")?.key ?? data.configuration.safety.severities[0]?.key}>{data.configuration.safety.severities.filter((item) => item.active).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></Field><Field label="Fecha"><Input name="occurredAt" type="datetime-local" defaultValue={nowInput()} required /></Field><Field label="Descripción"><Input name="description" required /></Field>
    </OperationForm> : null}
  </div>;
}

export function Operations({ data }: { data: TransportData }) {
  const movements = data.trips.flatMap((trip) => trip.assignments.map((assignment) => ({ ...assignment, tripCode: trip.code, operation: trip.operation }))).sort((left, right) => right.assignedAt.localeCompare(left.assignedAt));
  return <><PageHeader eyebrow="DESPACHO" title="Operaciones, viajes y trazabilidad" description="Registra el plan primero y ensambla tracto, carreta y hasta dos pilotos cuando estén disponibles." icon={Route} actions={<><NewOperation data={data} /><NewTrip data={data} /></>} />
    <Card className="table-card"><div className="management-heading"><div><span className="section-kicker">PLAN OPERATIVO</span><h2>Operaciones logísticas</h2></div></div><DataTable rows={data.operations} rowKey={(row) => row.id} columns={[
      { key: "operation", header: "Operación", cell: (row) => <span className="table-primary"><strong>{row.code} · {row.name}</strong><span>{row.customer?.legalName ?? "Varios clientes / por definir"}</span></span> },
      { key: "period", header: "Periodo", cell: (row) => <span className="table-primary"><strong>{formatDateTime(row.plannedStartAt)}</strong><span>hasta {formatDateTime(row.plannedEndAt)}</span></span> },
      { key: "trips", header: "Viajes", cell: (row) => <span className="table-primary"><strong>{row.tripCount} total</strong><span>{row.pendingTrips} pendientes · {row.activeTrips} activos · {row.completedTrips} entregados</span></span> },
      { key: "status", header: "Estado", cell: (row) => <Badge value={row.status} /> },
    ]} /></Card>
    <Card className="table-card"><div className="management-heading"><div><span className="section-kicker">VIAJES</span><h2>Servicios programados</h2></div></div><DataTable rows={data.trips} rowKey={(row) => row.id} pageSize={8} columns={[
    { key: "code", header: "Servicio", cell: (row) => <span className="table-primary"><strong>{row.code}</strong><span>{row.operation ? `${row.operation.code} · ${row.operation.name}` : "Sin operación"}</span><span>{row.customer.legalName} · {row.serviceType}</span></span> },
    { key: "route", header: "Ruta", cell: (row) => <span className="table-primary"><strong>{row.route.origin.name} → {row.route.destination.name}</strong><span>{formatDateTime(row.scheduledStartAt)}</span></span> },
    { key: "resource", header: "Ensamble", cell: (row) => { const active = row.assignments.find((item) => item.status === "ACTIVE"); return active ? <span className="table-primary"><strong>{active.vehicle.plate}{active.trailer ? ` + ${active.trailer.plate}` : ""}</strong><span>Piloto: {active.driver.firstName} {active.driver.lastName}</span>{active.secondDriver ? <span>Segundo: {active.secondDriver.firstName} {active.secondDriver.lastName}</span> : null}</span> : "Sin ensamblar"; } },
    { key: "money", header: "Flete / margen", align: "right", cell: (row) => <span className="table-primary"><strong>{money(row.freightCents)}</strong><span>{row.settlement ? money(row.settlement.balanceCents) : "Sin liquidar"}</span></span> },
    { key: "status", header: "Estado", cell: (row) => <Badge value={row.status} /> },
    { key: "actions", header: "Acciones", cell: (row) => <TripActions trip={row} data={data} /> },
  ]} /></Card>
    <Card className="table-card"><div className="management-heading"><div><span className="section-kicker">TRAZABILIDAD</span><h2>Historial de ensambles y movimientos</h2></div></div><DataTable rows={movements} rowKey={(row) => row.id} pageSize={8} columns={[
      { key: "trip", header: "Viaje / operación", cell: (row) => <span className="table-primary"><strong>{row.tripCode}</strong><span>{row.operation ? `${row.operation.code} · ${row.operation.name}` : "Sin operación"}</span></span> },
      { key: "equipment", header: "Equipo", cell: (row) => <span className="table-primary"><strong>{row.vehicle.plate}</strong><span>{row.trailer ? `Carreta ${row.trailer.plate}` : "Sin carreta"}</span></span> },
      { key: "crew", header: "Tripulación", cell: (row) => <span className="table-primary"><strong>{row.driver.firstName} {row.driver.lastName}</strong><span>{row.secondDriver ? `Segundo: ${row.secondDriver.firstName} ${row.secondDriver.lastName}` : "Sin segundo piloto"}</span></span> },
      { key: "movement", header: "Movimiento", cell: (row) => <span className="table-primary"><strong>{formatDateTime(row.assignedAt)}</strong><span>{row.releasedAt ? `Liberado ${formatDateTime(row.releasedAt)}` : `Programado hasta ${formatDateTime(row.endsAt)}`}</span></span> },
      { key: "reason", header: "Motivo", cell: (row) => row.reason ?? "Asignación operativa" },
      { key: "status", header: "Estado", cell: (row) => <Badge value={row.status} /> },
    ]} /></Card></>;
}
