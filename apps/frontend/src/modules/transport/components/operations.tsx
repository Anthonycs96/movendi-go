"use client";

import { useState } from "react";
import { CalendarClock, ClipboardList, FileSpreadsheet, History, RadioTower, Route, Truck } from "lucide-react";
import type { TransportData } from "@movendi/contracts";
import { Button, Card, DataTable, Field, Input, OperationButton, OperationForm, PageHeader, Select, StatusBadge } from "@/shared/components/ui";
import { formatDateTime } from "@/shared/lib/format";
import { Badge, money, nowInput, futureInput } from "./transport-ui";
import { DailyDispatch, OperationalExcelImport } from "./daily-dispatch";

const trailerLabel = (item: TransportData["trailers"][number]) => `${item.plate} · ${[item.brand, item.model, item.type].filter(Boolean).join(" ")}`;
const assemblyEquipmentLabel = (item: TransportData["resourcePresets"][number]) => [item.vehicle.plate, ...item.trailers.map((trailer) => trailer.plate)].join(" + ");
const assemblyCrewLabel = (item: TransportData["resourcePresets"][number]) => item.drivers.map((driver) => `${driver.firstName} ${driver.lastName}`).join(" · ");
const presetLabel = (item: TransportData["resourcePresets"][number]) => `${assemblyEquipmentLabel(item)} · ${assemblyCrewLabel(item)}`;

function NewPreparedAssembly({ data, vehicleId = "", triggerLabel = "Preparar ensamble", triggerSize = "md" }: { data: TransportData; vehicleId?: string; triggerLabel?: string; triggerSize?: "sm" | "md" }) {
  return <OperationForm title="Preparar ensamble" description="Selecciona el tracto, la configuración de carreta y la tripulación. El sistema identificará el ensamble automáticamente con sus placas." endpoint="/api/operations/transport/resource-presets" triggerLabel={triggerLabel} triggerSize={triggerSize} submitLabel="Guardar ensamble" transform={(form) => {
    const trailerSelection = String(form.get("trailerSelection") ?? "");
    return {
      scopeType: "TENANT",
      scopeId: "",
      vehicleId: form.get("vehicleId"),
      couplingId: trailerSelection.startsWith("coupling:") ? trailerSelection.slice("coupling:".length) : "",
      trailerIds: trailerSelection.startsWith("trailer:") ? [trailerSelection.slice("trailer:".length)] : [],
      driverIds: [form.get("driverId"), form.get("secondDriverId"), form.get("reliefDriverId")].filter(Boolean),
    };
  }}>
    <Field label="Tracto"><Select name="vehicleId" required defaultValue={vehicleId}><option value="" disabled>Busca y selecciona una unidad</option>{data.vehicles.filter((item) => item.active && !["MAINTENANCE", "OUT_OF_SERVICE"].includes(item.status)).map((item) => <option key={item.id} value={item.id}>{item.plate} · {item.brand} {item.model} · {item.type}</option>)}</Select></Field>
    <Field label="Configuración de carreta" hint="Elige una carreta suelta o un conjunto físico inseparable."><Select name="trailerSelection" defaultValue="">
      <option value="">Solo tracto</option>
      {data.trailerCouplings.filter((item) => item.active).map((item) => <option key={`coupling:${item.id}`} value={`coupling:${item.id}`}>Conjunto fijo · {item.name} · {item.trailers.map((trailer) => trailer.plate).join(" + ")}</option>)}
      {data.trailers.filter((item) => item.active && item.status !== "OUT_OF_SERVICE" && !item.fixedCoupling).map((item) => <option key={`trailer:${item.id}`} value={`trailer:${item.id}`}>Carreta individual · {trailerLabel(item)}</option>)}
    </Select></Field>
    <Field label="Piloto"><Select name="driverId" required defaultValue=""><option value="" disabled>Busca y selecciona un piloto</option>{data.drivers.filter((item) => item.active && !["SUSPENDED", "INACTIVE"].includes(item.status)).map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.licenseNo}</option>)}</Select></Field>
    <Field label="Segundo piloto"><Select name="secondDriverId" defaultValue=""><option value="">Sin segundo piloto</option>{data.drivers.filter((item) => item.active && !["SUSPENDED", "INACTIVE"].includes(item.status)).map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.licenseNo}</option>)}</Select></Field>
    <Field label="Conductor de relevo"><Select name="reliefDriverId" defaultValue=""><option value="">Sin relevo</option>{data.drivers.filter((item) => item.active && !["SUSPENDED", "INACTIVE"].includes(item.status)).map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.licenseNo}</option>)}</Select></Field>
  </OperationForm>;
}
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
    <Field label="Inicio de cita"><Input name="appointmentStartAt" type="datetime-local" /></Field><Field label="Fin de cita"><Input name="appointmentEndAt" type="datetime-local" /></Field>
    <Field label="Flete (S/)"><Input name="freight" type="number" min="0" step="0.01" required /></Field><Field label="Presupuesto (S/)"><Input name="budget" type="number" min="0" step="0.01" required /></Field>
    <Field label="Referencia"><Input name="referenceNo" /></Field><Field label="Notas"><Input name="notes" /></Field>
  </OperationForm>;
}

function presetsForTrip(data: TransportData, trip: { customer: { id: string }; operationId: string | null }) {
  return data.resourcePresets.filter((item) => item.active && (item.scopeType === "TENANT" || item.scopeType === "CUSTOMER" && item.scopeId === trip.customer.id || item.scopeType === "OPERATION" && item.scopeId === trip.operationId));
}

function TowerTripAssignment({ trip, data, assigned, onOpenAssemblies }: { trip: TransportData["controlTowerTrips"][number]; data: TransportData; assigned: boolean; onOpenAssemblies: () => void }) {
  const presets = presetsForTrip(data, trip);
  if (trip.status === "IN_TRANSIT") return <StatusBadge tone="info">En ruta</StatusBadge>;
  if (!presets.length) return <Button type="button" size="sm" variant="secondary" onClick={onOpenAssemblies}>Crear ensamble</Button>;
  return <OperationForm title={`${assigned ? "Cambiar" : "Asignar"} ensamble · ${trip.code}`} description="Selecciona una unidad preparada. Antes de asignarla se validan disponibilidad, documentos, capacidad y horarios." endpoint={`/api/operations/transport/trips/${trip.id}/assign`} triggerLabel={assigned ? "Cambiar" : "Asignar"} triggerSize="sm" submitLabel="Confirmar asignación" transform={(form) => ({ presetId: form.get("presetId"), reason: form.get("reason") })}>
    <Field label="Ensamble preparado"><Select name="presetId" required defaultValue=""><option value="" disabled>Busca por placa o conductor</option>{presets.map((item) => <option key={item.id} value={item.id}>{presetLabel(item)}</option>)}</Select></Field>
    <Field label="Motivo"><Input name="reason" placeholder="Asignación desde torre de control" /></Field>
  </OperationForm>;
}

function ControlTower({ data, onOpenAssemblies }: { data: TransportData; onOpenAssemblies: () => void }) {
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [tripSearch, setTripSearch] = useState("");
  const activeByVehicle = new Map(data.activeAssemblies.map((item) => [item.vehicle.id, item]));
  const activeByTrip = new Map(data.activeAssemblies.map((item) => [item.trip.id, item]));
  const presetsByVehicle = new Map<string, TransportData["resourcePresets"]>();
  for (const preset of data.resourcePresets.filter((item) => item.active)) presetsByVehicle.set(preset.vehicle.id, [...(presetsByVehicle.get(preset.vehicle.id) ?? []), preset]);
  const vehicleQuery = vehicleSearch.trim().toLocaleLowerCase("es");
  const tripQuery = tripSearch.trim().toLocaleLowerCase("es");
  const vehicleRows = data.vehicles.filter((vehicle) => vehicle.active && (!vehicleQuery || [vehicle.plate, vehicle.brand, vehicle.model, vehicle.type, ...(presetsByVehicle.get(vehicle.id) ?? []).flatMap((preset) => preset.trailers.map((trailer) => trailer.plate))].join(" ").toLocaleLowerCase("es").includes(vehicleQuery))).map((vehicle) => ({ vehicle, presets: presetsByVehicle.get(vehicle.id) ?? [], movement: activeByVehicle.get(vehicle.id) ?? null }));
  const tripRows = data.controlTowerTrips.filter((trip) => !tripQuery || [trip.code, trip.customer.legalName, trip.route.origin.name, trip.route.destination.name, trip.status].join(" ").toLocaleLowerCase("es").includes(tripQuery));
  const assembledCount = data.vehicles.filter((vehicle) => vehicle.active && presetsByVehicle.has(vehicle.id)).length;
  const unassembledCount = data.vehicles.filter((vehicle) => vehicle.active && !presetsByVehicle.has(vehicle.id)).length;
  const waitingTrips = data.controlTowerTrips.filter((trip) => ["DRAFT", "PLANNED"].includes(trip.status)).length;

  return <div className="control-tower">
    <div className="control-tower__summary">
      <div><span>Placas activas</span><strong>{data.vehicles.filter((item) => item.active).length}</strong></div>
      <div><span>Ensambladas</span><strong>{assembledCount}</strong></div>
      <div><span>Sin ensamble</span><strong>{unassembledCount}</strong></div>
      <div><span>Viajes por asignar</span><strong>{waitingTrips}</strong></div>
    </div>
    <div className="control-tower__boards">
      <Card className="table-card control-tower__card"><div className="management-heading"><div><span className="section-kicker">FLOTA</span><h2>Placas y disponibilidad</h2><p>Identifica unidades ensambladas, libres, ocupadas o sin preparar.</p></div><Input type="search" value={vehicleSearch} onChange={(event) => setVehicleSearch(event.target.value)} aria-label="Buscar placas" placeholder="Buscar placa o carreta…" /></div><DataTable rows={vehicleRows} rowKey={(row) => row.vehicle.id} pageSize={8} columns={[
        { key: "plate", header: "Placa", sortValue: (row) => row.vehicle.plate, cell: (row) => <span className="table-primary"><strong>{row.vehicle.plate}</strong><span>{row.vehicle.brand} {row.vehicle.model}</span></span> },
        { key: "assembly", header: "Composición", cell: (row) => row.presets.length ? <span className="table-primary"><strong>{assemblyEquipmentLabel(row.presets[0])}</strong><span>{row.presets[0].trailers.length ? `Tracto + ${row.presets[0].trailers.length} carreta(s) · ${assemblyCrewLabel(row.presets[0])}` : `Solo tracto · ${assemblyCrewLabel(row.presets[0])}`}</span></span> : <StatusBadge tone="neutral">Sin ensamble</StatusBadge> },
        { key: "state", header: "Estado", cell: (row) => row.movement ? <StatusBadge tone="warning">En viaje · {row.movement.trip.code}</StatusBadge> : row.presets.length ? <StatusBadge tone="success">Ensamblada y disponible</StatusBadge> : ["MAINTENANCE", "OUT_OF_SERVICE"].includes(row.vehicle.status) ? <Badge value={row.vehicle.status} /> : <StatusBadge tone="neutral">Pendiente de ensamble</StatusBadge> },
        { key: "actions", header: "", cell: (row) => !row.presets.length && !["MAINTENANCE", "OUT_OF_SERVICE"].includes(row.vehicle.status) ? <NewPreparedAssembly data={data} vehicleId={row.vehicle.id} triggerLabel="Ensamblar" triggerSize="sm" /> : null },
      ]} /></Card>
      <Card className="table-card control-tower__card"><div className="management-heading"><div><span className="section-kicker">DESPACHO</span><h2>Viajes activos y pendientes</h2><p>Asigna una unidad preparada sin salir de la torre de control.</p></div><Input type="search" value={tripSearch} onChange={(event) => setTripSearch(event.target.value)} aria-label="Buscar viajes" placeholder="Buscar viaje o cliente…" /></div><DataTable rows={tripRows} rowKey={(row) => row.id} pageSize={8} emptyTitle="No hay viajes activos" columns={[
        { key: "trip", header: "Viaje", sortValue: (row) => row.code, cell: (row) => <span className="table-primary"><strong>{row.code}</strong><span>{row.customer.legalName}</span></span> },
        { key: "route", header: "Ruta / salida", cell: (row) => <span className="table-primary"><strong>{row.route.origin.name} → {row.route.destination.name}</strong><span>{formatDateTime(row.scheduledStartAt)}</span></span> },
        { key: "unit", header: "Unidad", cell: (row) => { const movement = activeByTrip.get(row.id); return movement ? <span className="table-primary"><strong>{movement.vehicle.plate}</strong><span>{movement.trailers.map((item) => item.plate).join(" + ") || "Solo tracto"}</span></span> : <StatusBadge tone="neutral">Sin asignar</StatusBadge>; } },
        { key: "status", header: "Estado", cell: (row) => <Badge value={row.status} /> },
        { key: "actions", header: "", cell: (row) => <TowerTripAssignment trip={row} data={data} assigned={activeByTrip.has(row.id)} onOpenAssemblies={onOpenAssemblies} /> },
      ]} /></Card>
    </div>
  </div>;
}

function TripActions({ trip, data, onOpenAssemblies }: { trip: TransportData["trips"][number]; data: TransportData; onOpenAssemblies: () => void }) {
  const nextStatuses = data.configuration.operations.tripStatuses.find((item) => item.key === trip.status)?.allowedNext ?? [];
  const statusLabel = (key: string) => data.configuration.operations.tripStatuses.find((item) => item.key === key)?.label ?? key;
  const workflow = trip.workflow ? data.workflows.find((item) => item.id === trip.workflow?.id) : null;
  const workflowTargets = workflow ? trip.workflowState ? workflow.transitions.filter((item) => item.active && item.fromStateId === trip.workflowState?.id).map((item) => ({ state: workflow.states.find((state) => state.id === item.toStateId), transition: item })).filter((item) => item.state) : workflow.states.filter((state) => state.initial).map((state) => ({ state, transition: null })) : data.workflows.filter((item) => item.active && (item.scopeType === "TENANT" || item.scopeType === "CUSTOMER" && item.scopeId === trip.customer.id || item.scopeType === "OPERATION" && item.scopeId === trip.operationId)).flatMap((item) => item.states.filter((state) => state.initial && state.active).map((state) => ({ state, transition: null })));
  const availablePresets = presetsForTrip(data, trip);
  return <div className="table-actions">
    <OperationForm title={`Operación de ${trip.code}`} description="Puedes asociar o mover este viaje sin modificar su unidad ni conductor." endpoint={`/api/operations/transport/trips/${trip.id}/operation`} method="PATCH" triggerLabel={trip.operation ? "Cambiar operación" : "Asignar operación"}>
      <Field label="Operación"><Select name="operationId" defaultValue={trip.operationId ?? ""}><option value="">Sin operación</option>{data.operations.filter((item) => ["PLANNED", "IN_PROGRESS"].includes(item.status) || item.id === trip.operationId).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</Select></Field>
    </OperationForm>
    {trip.status !== "DELIVERED" && trip.status !== "CANCELLED" ? availablePresets.length ? <OperationForm title={`Asignar ensamble preparado · ${trip.code}`} description="Selecciona una unidad previamente armada. Al confirmar se validan documentos, jornadas, capacidad, compatibilidad y solapamientos." endpoint={`/api/operations/transport/trips/${trip.id}/assign`} triggerLabel={trip.assignments.some((item) => item.status === "ACTIVE") ? "Cambiar ensamble" : "Asignar ensamble"} submitLabel="Asignar al viaje" transform={(form) => ({ presetId: form.get("presetId"), reason: form.get("reason") })}>
      <Field label="Ensamble preparado"><Select name="presetId" required defaultValue=""><option value="" disabled>Busca por placa o conductor</option>{availablePresets.map((item) => <option key={item.id} value={item.id}>{presetLabel(item)}</option>)}</Select></Field>
      <Field label="Motivo"><Input name="reason" placeholder="Asignación operativa" /></Field>
    </OperationForm> : <Button type="button" size="sm" variant="secondary" onClick={onOpenAssemblies}>Preparar ensamble primero</Button> : null}
    {nextStatuses.map((status) => <OperationButton key={status} endpoint={`/api/operations/transport/trips/${trip.id}/status`} body={{ status }} variant={status === "CANCELLED" ? "danger" : "secondary"}>{statusLabel(status)}</OperationButton>)}
    {workflowTargets.map(({ state, transition }) => state ? transition?.requiresReason ? <OperationForm key={state.id} title={`Cambiar a ${state.label}`} endpoint={`/api/operations/transport/trips/${trip.id}/workflow`} method="PATCH" triggerLabel={state.label} transform={(form) => ({ stateId: state.id, reason: form.get("reason") })}><Field label="Motivo"><Input name="reason" required /></Field></OperationForm> : <OperationButton key={state.id} endpoint={`/api/operations/transport/trips/${trip.id}/workflow`} body={{ stateId: state.id }}>{state.label}</OperationButton> : null)}
    {["ASSIGNED", "IN_TRANSIT"].includes(trip.status) ? <OperationForm title={`Seguimiento ${trip.code}`} endpoint={`/api/operations/transport/trips/${trip.id}/tracking`} triggerLabel="Seguimiento">
      <Field label="Evento"><Select name="type" defaultValue={data.configuration.operations.trackingEvents.find((item) => item.key === "POSITION")?.key ?? data.configuration.operations.trackingEvents[0]?.key}>{data.configuration.operations.trackingEvents.filter((item) => item.active).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></Field><Field label="Fecha"><Input name="recordedAt" type="datetime-local" defaultValue={nowInput()} required /></Field><Field label="Latitud"><Input name="latitude" type="number" step="any" /></Field><Field label="Longitud"><Input name="longitude" type="number" step="any" /></Field><Field label="Odómetro"><Input name="odometerKm" type="number" step="0.1" /></Field><Field label="Descripción"><Input name="description" /></Field>
    </OperationForm> : null}
    {! ["DELIVERED", "CANCELLED"].includes(trip.status) ? <OperationForm title={`Reportar incidente · ${trip.code}`} endpoint={`/api/operations/transport/trips/${trip.id}/incidents`} triggerLabel="Incidente">
      <Field label="Tipo"><Select name="type" defaultValue="" required><option value="" disabled>Selecciona</option>{data.configuration.safety.incidentTypes.filter((item) => item.active).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></Field><Field label="Severidad"><Select name="severity" defaultValue={data.configuration.safety.severities.find((item) => item.key === "MEDIUM")?.key ?? data.configuration.safety.severities[0]?.key}>{data.configuration.safety.severities.filter((item) => item.active).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></Field><Field label="Fecha"><Input name="occurredAt" type="datetime-local" defaultValue={nowInput()} required /></Field><Field label="Descripción"><Input name="description" required /></Field>
    </OperationForm> : null}
    {data.documentTemplates.filter((template) => template.active && (template.scopeType === "TENANT" || template.scopeType === "CUSTOMER" && template.scopeId === trip.customer.id || template.scopeType === "OPERATION" && template.scopeId === trip.operationId)).map((template) => <Button key={template.id} type="button" size="sm" variant="ghost" onClick={() => { window.open(`/api/transport/document-templates/${template.id}/render?tripId=${trip.id}`, "_self"); }}>{template.name}</Button>)}
  </div>;
}

type OperationsTab = "tower" | "trips" | "assemblies" | "dispatch" | "import" | "operations" | "history";

export function Operations({ data }: { data: TransportData }) {
  const [activeTab, setActiveTab] = useState<OperationsTab>("tower");
  const [assemblySearch, setAssemblySearch] = useState("");
  const movements = data.trips.flatMap((trip) => trip.assignments.map((assignment) => ({ ...assignment, trip, tripCode: trip.code, operation: trip.operation }))).sort((left, right) => right.assignedAt.localeCompare(left.assignedAt));
  const activeByVehicle = new Map(data.activeAssemblies.map((item) => [item.vehicle.id, item]));
  const normalizedAssemblySearch = assemblySearch.trim().toLocaleLowerCase("es");
  const assemblyRows = data.resourcePresets.filter((item) => !normalizedAssemblySearch || [item.code, item.vehicle.plate, ...item.trailers.map((trailer) => trailer.plate), ...item.drivers.flatMap((driver) => [driver.firstName, driver.lastName])].join(" ").toLocaleLowerCase("es").includes(normalizedAssemblySearch));
  const tabs: Array<{ id: OperationsTab; label: string; hint: string; count?: number; icon: typeof Route }> = [
    { id: "tower", label: "Torre de control", hint: "Flota y viajes en una vista", count: data.controlTowerTrips.length, icon: RadioTower },
    { id: "trips", label: "Viajes", hint: "Servicios y acciones", count: data.trips.length, icon: Route },
    { id: "assemblies", label: "Placas y ensambles", hint: "Preparar antes del viaje", count: data.resourcePresets.filter((item) => item.active).length, icon: Truck },
    { id: "dispatch", label: "Despacho diario", hint: "Agenda y citas", icon: CalendarClock },
    { id: "import", label: "Importar viajes", hint: "Carga desde Excel", icon: FileSpreadsheet },
    { id: "operations", label: "Operaciones", hint: "Agrupación logística", count: data.operations.length, icon: ClipboardList },
    { id: "history", label: "Historial", hint: "Trazabilidad de ensambles", count: movements.length, icon: History },
  ];

  return <>
    <PageHeader eyebrow="DESPACHO" title="Operaciones, viajes y trazabilidad" description="Consulta viajes, placas y ensambles en vistas separadas. Importa y despacha sin recorrer bloques apilados." icon={Route} actions={<><NewOperation data={data} /><NewTrip data={data} /></>} />
    <nav className="operations-tabs" role="tablist" aria-label="Vistas de operaciones">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const selected = activeTab === tab.id;
        return <button key={tab.id} id={`operations-tab-${tab.id}`} type="button" role="tab" aria-selected={selected} aria-controls={`operations-panel-${tab.id}`} className={selected ? "active" : ""} onClick={() => setActiveTab(tab.id)}>
          <Icon size={17} />
          <span><strong>{tab.label}</strong><small>{tab.hint}</small></span>
          {tab.count !== undefined ? <b>{tab.count}</b> : null}
        </button>;
      })}
    </nav>

    <section id={`operations-panel-${activeTab}`} className="operations-tab-panel" role="tabpanel" aria-labelledby={`operations-tab-${activeTab}`}>
      {activeTab === "tower" ? <ControlTower data={data} onOpenAssemblies={() => setActiveTab("assemblies")} /> : null}

      {activeTab === "trips" ? <Card className="table-card"><div className="management-heading"><div><span className="section-kicker">PASO 2 · VIAJES</span><h2>Asignar ensambles preparados</h2><p>Elige un ensamble ya creado; aquí no se arman tractos, carretas ni pilotos.</p></div></div><DataTable rows={data.trips} rowKey={(row) => row.id} pageSize={8} columns={[
        { key: "code", header: "Servicio", cell: (row) => <span className="table-primary"><strong>{row.code}</strong><span>{row.operation ? `${row.operation.code} · ${row.operation.name}` : "Sin operación"}</span><span>{row.customer.legalName} · {row.serviceType}</span></span> },
        { key: "route", header: "Ruta", cell: (row) => <span className="table-primary"><strong>{row.route.origin.name} → {row.route.destination.name}</strong><span>{formatDateTime(row.scheduledStartAt)}</span></span> },
        { key: "resource", header: "Ensamble", cell: (row) => { const active = row.assignments.find((item) => item.status === "ACTIVE"); return active ? <span className="table-primary"><strong>{active.vehicle.plate}{active.trailers.length ? ` + ${active.trailers.map((item) => item.plate).join(" + ")}` : active.trailer ? ` + ${active.trailer.plate}` : ""}</strong><span>{active.drivers.length ? active.drivers.map((item) => `${item.role}: ${item.firstName} ${item.lastName}`).join(" · ") : `Piloto: ${active.driver.firstName} ${active.driver.lastName}`}</span></span> : "Sin ensamblar"; } },
        { key: "money", header: "Flete / margen", align: "right", cell: (row) => <span className="table-primary"><strong>{money(row.freightCents)}</strong><span>{row.settlement ? money(row.settlement.balanceCents) : "Sin liquidar"}</span></span> },
        { key: "status", header: "Estado", cell: (row) => <Badge value={row.status} /> },
        { key: "actions", header: "Acciones", cell: (row) => <TripActions trip={row} data={data} onOpenAssemblies={() => setActiveTab("assemblies")} /> },
      ]} /></Card> : null}

      {activeTab === "assemblies" ? <Card className="table-card"><div className="management-heading"><div><span className="section-kicker">PASO 1 · PREPARACIÓN</span><h2>Placas y ensambles preparados</h2><p>Primero combina tracto, carretas y pilotos. Después podrás asignar el conjunto desde la pestaña Viajes.</p></div><div className="assembly-toolbar"><Input type="search" value={assemblySearch} onChange={(event) => setAssemblySearch(event.target.value)} aria-label="Buscar ensambles" placeholder="Buscar placa o piloto…" /><NewPreparedAssembly data={data} /></div></div><DataTable rows={assemblyRows} rowKey={(row) => row.id} pageSize={12} emptyTitle="No hay ensambles preparados" columns={[
        { key: "name", header: "Composición", sortValue: (row) => assemblyEquipmentLabel(row), cell: (row) => <span className="table-primary"><strong>{assemblyEquipmentLabel(row)}</strong><span>{row.trailers.length ? `1 tracto · ${row.trailers.length} carreta(s)` : "Solo tracto"}</span></span> },
        { key: "plate", header: "Tracto", sortValue: (row) => row.vehicle.plate, cell: (row) => <span className="table-primary"><strong>{row.vehicle.plate}</strong><span>Unidad principal</span></span> },
        { key: "trailers", header: "Carretas", cell: (row) => row.trailers.length ? row.trailers.map((item) => item.plate).join(" + ") : "Solo tracto" },
        { key: "drivers", header: "Tripulación", cell: (row) => <span className="table-primary"><strong>{row.drivers.map((item) => `${item.firstName} ${item.lastName}`).join(" · ")}</strong><span>{row.drivers.length} conductor(es)</span></span> },
        { key: "trip", header: "Uso actual", cell: (row) => { const movement = activeByVehicle.get(row.vehicle.id); return movement ? <span className="table-primary"><strong>{movement.trip.code}</strong><span>{movement.trip.route.origin.name} → {movement.trip.route.destination.name}</span></span> : "Disponible para asignar"; } },
        { key: "status", header: "Estado", cell: (row) => <Badge value={row.active ? activeByVehicle.has(row.vehicle.id) ? "ASSIGNED" : "AVAILABLE" : "INACTIVE"} /> },
      ]} /></Card> : null}

      {activeTab === "dispatch" ? <DailyDispatch data={data} /> : null}

      {activeTab === "import" ? <Card className="operations-import-card"><div className="management-heading"><div><span className="section-kicker">CARGA MASIVA</span><h2>Subir viajes desde Excel</h2><p>Descarga la plantilla, valida el archivo y confirma la importación desde un espacio independiente.</p></div></div><OperationalExcelImport data={data} /></Card> : null}

      {activeTab === "operations" ? <Card className="table-card"><div className="management-heading"><div><span className="section-kicker">PLAN OPERATIVO</span><h2>Operaciones logísticas</h2></div></div><DataTable rows={data.operations} rowKey={(row) => row.id} columns={[
        { key: "operation", header: "Operación", cell: (row) => <span className="table-primary"><strong>{row.code} · {row.name}</strong><span>{row.customer?.legalName ?? "Varios clientes / por definir"}</span></span> },
        { key: "period", header: "Periodo", cell: (row) => <span className="table-primary"><strong>{formatDateTime(row.plannedStartAt)}</strong><span>hasta {formatDateTime(row.plannedEndAt)}</span></span> },
        { key: "trips", header: "Viajes", cell: (row) => <span className="table-primary"><strong>{row.tripCount} total</strong><span>{row.pendingTrips} pendientes · {row.activeTrips} activos · {row.completedTrips} entregados</span></span> },
        { key: "status", header: "Estado", cell: (row) => <Badge value={row.status} /> },
      ]} /></Card> : null}

      {activeTab === "history" ? <Card className="table-card"><div className="management-heading"><div><span className="section-kicker">TRAZABILIDAD</span><h2>Historial de ensambles y movimientos</h2></div></div><DataTable rows={movements} rowKey={(row) => row.id} pageSize={8} columns={[
        { key: "trip", header: "Viaje / operación", cell: (row) => <span className="table-primary"><strong>{row.tripCode}</strong><span>{row.operation ? `${row.operation.code} · ${row.operation.name}` : "Sin operación"}</span></span> },
        { key: "equipment", header: "Equipo", cell: (row) => <span className="table-primary"><strong>{row.vehicle.plate}</strong><span>{row.trailers.length ? `Carretas ${row.trailers.map((item) => item.plate).join(" + ")}` : row.trailer ? `Carreta ${row.trailer.plate}` : "Sin carreta"}</span></span> },
        { key: "crew", header: "Tripulación", cell: (row) => <span className="table-primary"><strong>{row.drivers.length ? `${row.drivers.length} conductores` : `${row.driver.firstName} ${row.driver.lastName}`}</strong><span>{row.drivers.length ? row.drivers.map((item) => `${item.firstName} ${item.lastName}`).join(" · ") : row.secondDriver ? `Segundo: ${row.secondDriver.firstName} ${row.secondDriver.lastName}` : "Sin segundo piloto"}</span></span> },
        { key: "movement", header: "Movimiento", cell: (row) => <span className="table-primary"><strong>{formatDateTime(row.assignedAt)}</strong><span>{row.releasedAt ? `Liberado ${formatDateTime(row.releasedAt)}` : `Programado hasta ${formatDateTime(row.endsAt)}`}</span></span> },
        { key: "reason", header: "Motivo", cell: (row) => row.reason ?? "Asignación operativa" },
        { key: "status", header: "Estado", cell: (row) => <Badge value={row.status} /> },
      ]} /></Card> : null}
    </section>
  </>;
}
