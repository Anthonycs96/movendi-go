"use client";

import { useState } from "react";
import { Cable, CookingPot, Copy, Printer, Route, Settings2 } from "lucide-react";
import type { RestaurantData } from "../types";
import { Button, Card, DataTable, Field, Input, OperationButton, OperationForm, Select, StatusBadge } from "@/shared/components/ui";

const booleanValue = (form: FormData, name: string) => form.get(name) === "true" || form.get(name) === "on";
const fieldOptions = [
  ["table", "Mesa / canal"], ["orderCode", "Código del pedido"], ["createdAt", "Fecha y hora"], ["waiter", "Usuario que atendió"],
  ["customer", "Cliente"], ["delivery", "Datos de delivery"], ["itemNotes", "Notas por producto"], ["orderNotes", "Nota general"],
] as const;
const areaTypeLabels: Record<string, string> = {
  KITCHEN: "Cocina",
  BAR: "Barra",
  GRILL: "Parrilla",
  DESSERT: "Postres",
  BEVERAGE: "Bebidas",
  CUSTOM: "Personalizada",
};
const dispatchModeLabels: Record<string, string> = { KDS: "Pantalla KDS", PRINTER: "Impresora", NONE: "Sin despacho" };

function AgentTokenButton({ printerId }: { printerId: string }) {
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  async function regenerate() {
    setPending(true);
    try {
      const response = await fetch(`/api/operations/restaurant/print-devices/${printerId}/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await response.json() as { agentToken?: string };
      if (response.ok && result.agentToken) { setToken(result.agentToken); await navigator.clipboard?.writeText(result.agentToken); }
    } finally { setPending(false); }
  }
  return <span className="print-agent-token"><Button type="button" size="sm" variant="ghost" loading={pending} onClick={regenerate}><Cable size={14} />Token agente</Button>{token ? <small><code>{token}</code><button type="button" aria-label="Copiar token" onClick={() => void navigator.clipboard?.writeText(token)}><Copy size={12} /></button></small> : null}</span>;
}

export function PrintConfiguration({ data }: { data: RestaurantData }) {
  const activeAreas = data.preparationAreas.filter((area) => area.active);
  const activePrinters = data.printDevices.filter((printer) => printer.active);
  const configuredFields = data.printSettings.fields.length ? data.printSettings.fields : ["table", "orderCode", "createdAt", "waiter", "itemNotes", "orderNotes"];
  return <section className="print-configuration" id="comandas-impresion">
    <div className="management-heading"><div><span className="section-kicker">Restaurante</span><h2>Comandas e impresión</h2><p>Distribuye cada producto a la estación correcta y conecta impresoras web o agentes locales.</p></div><StatusBadge tone={data.printSettings.mode === "ADVANCED" ? "violet" : "info"}>{data.printSettings.mode === "ADVANCED" ? "Modo avanzado" : "Modo simple"}</StatusBadge></div>
    <details className="print-agent-help"><summary>Cómo conectar y comprobar una impresora</summary><ol><li>Para imprimir desde el navegador, crea una estación web y selecciónala en Cocina.</li><li>Para impresión automática, conecta una térmica ESC/POS por red y solicita al instalador que configure el agente local con su IP y el token de esta impresora.</li><li>Asigna la impresora principal o las rutas por área y envía una prueba.</li><li>En Cocina, confirma que el papel salió correctamente. Si no salió, revisa papel y conexión antes de reimprimir.</li></ol><p>El agente disponible usa red TCP/IP. Las impresoras USB requieren instalación adicional. Regenerar un token desconecta al agente anterior.</p></details>
    <div className="print-config-summary">
      <Card><CookingPot size={20} /><strong>{data.preparationAreas.length} áreas</strong><small>Dinámicas por sede</small></Card>
      <Card><Printer size={20} /><strong>{data.printDevices.length} impresoras</strong><small>Web o agente local</small></Card>
      <Card><Route size={20} /><strong>{data.categories.filter((item) => item.preparationArea).length + data.products.filter((item) => item.preparationArea).length} rutas</strong><small>Categorías y excepciones</small></Card>
    </div>

    <Card className="print-config-card">
      <div><Settings2 size={20} /><div><h3>Configuración general</h3><p>Una impresora para todo o distribución por áreas.</p></div></div>
      <OperationForm title="Configurar comandas" description="El modo simple envía todo a la impresora principal. El avanzado distribuye por las rutas configuradas." endpoint="/api/operations/restaurant/print-settings" method="PATCH" triggerLabel="Configurar" submitLabel="Guardar configuración" transform={(form) => ({ mode: form.get("mode"), automatic: form.get("automatic") === "on", defaultPrinterId: form.get("defaultPrinterId"), fields: fieldOptions.filter(([key]) => form.get(key) === "on").map(([key]) => key) })}>
        <Field label="Modo"><Select name="mode" defaultValue={data.printSettings.mode}><option value="SIMPLE">Simple · toda la comanda</option><option value="ADVANCED">Avanzado · distribuir por áreas</option></Select></Field>
        <Field label="Impresora principal"><Select name="defaultPrinterId" defaultValue={data.printSettings.defaultPrinterId ?? ""}><option value="">Estación web sin impresora asignada</option>{activePrinters.map((printer) => <option value={printer.id} key={printer.id}>{printer.name}</option>)}</Select></Field>
        <label className="platform-check"><input name="automatic" type="checkbox" defaultChecked={data.printSettings.automatic} /><span><strong>Impresión automática global</strong><small>El agente o estación toma la comanda al confirmarla.</small></span></label>
        <fieldset className="print-field-selector"><legend>Información visible en la comanda</legend>{fieldOptions.map(([key, label]) => <label key={key}><input type="checkbox" name={key} defaultChecked={configuredFields.includes(key)} />{label}</label>)}</fieldset>
      </OperationForm>
    </Card>

    <div className="settings-actions print-config-actions">
      <OperationForm title="Nueva área de preparación" description="Define la estación operativa y cómo recibirá sus comandas." endpoint="/api/operations/restaurant/preparation-areas" triggerLabel="Nueva área" transform={(form) => ({ name: form.get("name"), type: form.get("type"), dispatchMode: form.get("dispatchMode"), active: true })}>
        <Field label="Nombre"><Input name="name" required placeholder="Ej. Parrilla" /></Field>
        <Field label="Tipo"><Select name="type" defaultValue="CUSTOM"><option value="KITCHEN">Cocina</option><option value="BAR">Barra</option><option value="GRILL">Parrilla</option><option value="DESSERT">Postres</option><option value="BEVERAGE">Bebidas</option><option value="CUSTOM">Personalizada</option></Select></Field>
        <Field label="Destino de comandas"><Select name="dispatchMode" defaultValue="KDS"><option value="KDS">Pantalla KDS</option><option value="PRINTER">Impresora</option><option value="NONE">Sin despacho</option></Select></Field>
      </OperationForm>
      <OperationForm title="Nueva impresora" description="Al guardar se mostrará una vez el token para el agente local." endpoint="/api/operations/restaurant/print-devices" triggerLabel="Nueva impresora" transform={(form) => ({ name: form.get("name"), connectionType: form.get("connectionType"), paperWidthMm: Number(form.get("paperWidthMm")), automatic: form.get("automatic") === "on", active: true })}>
        <Field label="Nombre"><Input name="name" required placeholder="Ej. Térmica de cocina" /></Field><Field label="Conexión"><Select name="connectionType" defaultValue="LOCAL_AGENT"><option value="LOCAL_AGENT">Agente local</option><option value="BROWSER">Navegador / estación web</option></Select></Field><Field label="Papel"><Select name="paperWidthMm" defaultValue="80"><option value="80">80 mm</option><option value="58">58 mm</option></Select></Field><label className="platform-check"><input type="checkbox" name="automatic" defaultChecked /><span><strong>Automática</strong><small>Procesa trabajos sin intervención.</small></span></label>
      </OperationForm>
      <OperationForm title="Asignar impresora a un área" endpoint="/api/operations/restaurant/area-printers" triggerLabel="Área → impresora" transform={(form) => ({ areaId: form.get("areaId"), printerId: form.get("printerId"), copies: Number(form.get("copies")), active: true })}><Field label="Área"><Select name="areaId" defaultValue="" required><option value="" disabled>Selecciona área</option>{activeAreas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</Select></Field><Field label="Impresora"><Select name="printerId" defaultValue="" required><option value="" disabled>Selecciona impresora</option>{activePrinters.map((printer) => <option value={printer.id} key={printer.id}>{printer.name}</option>)}</Select></Field><Field label="Copias"><Input name="copies" type="number" min="1" max="5" defaultValue="1" required /></Field></OperationForm>
      <OperationForm title="Ruta por categoría" endpoint="/api/operations/restaurant/print-routes" triggerLabel="Asignar categoría" transform={(form) => ({ targetType: "CATEGORY", targetId: form.get("targetId"), preparationAreaId: form.get("preparationAreaId") })}><Field label="Categoría"><Select name="targetId" defaultValue="" required><option value="" disabled>Selecciona categoría</option>{data.categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</Select></Field><Field label="Área"><Select name="preparationAreaId" defaultValue=""><option value="">Sin ruta / impresora principal</option>{activeAreas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</Select></Field></OperationForm>
      <OperationForm title="Excepción por producto" endpoint="/api/operations/restaurant/print-routes" triggerLabel="Asignar producto" transform={(form) => ({ targetType: "PRODUCT", targetId: form.get("targetId"), preparationAreaId: form.get("preparationAreaId") })}><Field label="Producto"><Select name="targetId" defaultValue="" required><option value="" disabled>Selecciona producto</option>{data.products.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</Select></Field><Field label="Área"><Select name="preparationAreaId" defaultValue=""><option value="">Heredar categoría</option>{activeAreas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</Select></Field></OperationForm>
    </div>

    <section className="management-grid print-config-grid">
      <Card className="table-card"><div className="management-heading"><div><span className="section-kicker">Estaciones</span><h2>Áreas de preparación</h2></div></div><DataTable rows={data.preparationAreas} rowKey={(row) => row.id} columns={[
        { key: "area", header: "Área", cell: (row) => <span className="table-primary"><strong>{row.name}</strong><span>{row.printers.filter((item) => item.active).map((item) => `${item.name} · ${item.copies} copia(s)`).join(" · ") || (row.dispatchMode === "KDS" ? "Atiende en pantalla KDS" : row.dispatchMode === "NONE" ? "No genera despacho" : "Falta asignar impresora")}</span></span> },
        { key: "type", header: "Tipo", cell: (row) => areaTypeLabels[row.type] ?? row.type },
        { key: "dispatch", header: "Despacho", cell: (row) => <StatusBadge tone={row.dispatchMode === "PRINTER" ? "info" : row.dispatchMode === "KDS" ? "success" : "neutral"}>{dispatchModeLabels[row.dispatchMode] ?? row.dispatchMode}</StatusBadge> },
        { key: "routes", header: "Rutas", cell: (row) => `${data.categories.filter((item) => item.preparationArea?.id === row.id).length} categorías · ${data.products.filter((item) => item.preparationArea?.id === row.id).length} productos` },
        { key: "status", header: "Estado", cell: (row) => <StatusBadge tone={row.active ? "success" : "neutral"}>{row.active ? "Activa" : "Inactiva"}</StatusBadge> },
        { key: "actions", header: "Gestión", cell: (row) => <OperationForm title="Editar área" endpoint={`/api/operations/restaurant/preparation-areas/${row.id}`} method="PATCH" triggerLabel="Editar" transform={(form) => ({ name: form.get("name"), type: form.get("type"), dispatchMode: form.get("dispatchMode"), active: booleanValue(form, "active") })}><Field label="Nombre"><Input name="name" required defaultValue={row.name} /></Field><Field label="Tipo"><Select name="type" defaultValue={row.type}><option value="KITCHEN">Cocina</option><option value="BAR">Barra</option><option value="GRILL">Parrilla</option><option value="DESSERT">Postres</option><option value="BEVERAGE">Bebidas</option><option value="CUSTOM">Personalizada</option></Select></Field><Field label="Destino de comandas"><Select name="dispatchMode" defaultValue={row.dispatchMode}><option value="KDS">Pantalla KDS</option><option value="PRINTER">Impresora</option><option value="NONE">Sin despacho</option></Select></Field><Field label="Estado"><Select name="active" defaultValue={String(row.active)}><option value="true">Activa</option><option value="false">Inactiva</option></Select></Field></OperationForm> },
      ]} /></Card>
      <Card className="table-card"><div className="management-heading"><div><span className="section-kicker">Dispositivos</span><h2>Impresoras</h2></div></div><DataTable rows={data.printDevices} rowKey={(row) => row.id} columns={[
        { key: "printer", header: "Impresora", cell: (row) => <span className="table-primary"><strong>{row.name}</strong><span>{row.connectionType === "LOCAL_AGENT" ? `Agente local · token …${row.tokenHint ?? "sin configurar"}` : "Estación web"}</span></span> },
        { key: "paper", header: "Papel", cell: (row) => `${row.paperWidthMm} mm` },
        { key: "status", header: "Estado", cell: (row) => <StatusBadge tone={row.active ? "success" : "neutral"}>{row.active ? row.lastSeenAt ? "Conexión registrada" : "Configurada" : "Inactiva"}</StatusBadge> },
        { key: "actions", header: "Gestión", cell: (row) => <span className="print-device-actions"><OperationButton endpoint={`/api/operations/restaurant/print-devices/${row.id}/test`} method="POST">Prueba</OperationButton><AgentTokenButton printerId={row.id} /><OperationForm title="Editar impresora" endpoint={`/api/operations/restaurant/print-devices/${row.id}`} method="PATCH" triggerLabel="Editar" transform={(form) => ({ name: form.get("name"), connectionType: form.get("connectionType"), paperWidthMm: Number(form.get("paperWidthMm")), automatic: booleanValue(form, "automatic"), active: booleanValue(form, "active") })}><Field label="Nombre"><Input name="name" required defaultValue={row.name} /></Field><Field label="Conexión"><Select name="connectionType" defaultValue={row.connectionType}><option value="LOCAL_AGENT">Agente local</option><option value="BROWSER">Navegador</option></Select></Field><Field label="Papel"><Select name="paperWidthMm" defaultValue={String(row.paperWidthMm)}><option value="80">80 mm</option><option value="58">58 mm</option></Select></Field><Field label="Automática"><Select name="automatic" defaultValue={String(row.automatic)}><option value="true">Sí</option><option value="false">Manual</option></Select></Field><Field label="Estado"><Select name="active" defaultValue={String(row.active)}><option value="true">Activa</option><option value="false">Inactiva</option></Select></Field></OperationForm></span> },
      ]} /></Card>
    </section>
  </section>;
}
