"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Printer, RefreshCw, TriangleAlert } from "lucide-react";
import { Button, Card, StatusBadge } from "@/shared/components/ui";

type PrintItem = { name: string; quantity: number; notes: string | null };
type PrintJob = {
  id: string; printerId: string | null; type: "INITIAL" | "ADDITION" | "CANCELLATION" | "TEST"; status: "PENDING" | "PROCESSING" | "PRINTED" | "FAILED" | "SENT" | "UNKNOWN"; claimable: boolean; automatic: boolean; copies: number; attempts: number; lastError: string | null; createdAt: string; printedAt: string | null;
  order: { code: string; source: string; notes: string | null; tableName: string | null }; createdBy: string; payload: { printerName?: string; fields?: string[]; sections?: Array<{ areaName: string; items: PrintItem[] }>; items?: PrintItem[]; orderNotes?: string | null };
};

const typeLabels = { INITIAL: "COMANDA", ADDITION: "ADICIONAL", CANCELLATION: "ANULACIÓN", TEST: "PRUEBA" };

export function KitchenPrintStation({ businessName, printers }: { businessName: string; printers: Array<{ id: string; name: string; connectionType: string }> }) {
  const [enabled, setEnabled] = useState(false);
  const [simulation, setSimulation] = useState(false);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [current, setCurrent] = useState<PrintJob | null>(null);
  const [message, setMessage] = useState("");
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const processing = useRef<string | null>(null);
  const stationId = useRef("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setEnabled(window.localStorage.getItem("movendi-kitchen-print-enabled") === "true");
      setSimulation(window.localStorage.getItem("movendi-kitchen-print-simulation") === "true");
      const savedPrinter = window.localStorage.getItem("movendi-kitchen-printer-id") ?? "";
      setSelectedPrinter(printers.some((printer) => printer.id === savedPrinter) ? savedPrinter : printers.find((printer) => printer.connectionType === "BROWSER")?.id ?? printers[0]?.id ?? "");
      const savedStationId = window.sessionStorage.getItem("movendi-kitchen-print-station-id");
      stationId.current = savedStationId || (window.crypto.randomUUID?.() ?? `station-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      if (!savedStationId) window.sessionStorage.setItem("movendi-kitchen-print-station-id", stationId.current);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [printers]);

  const updateStatus = useCallback(async (job: PrintJob, status: "PRINTED" | "FAILED" | "UNKNOWN", error?: string) => {
    const response = await fetch(`/api/operations/restaurant/print-jobs/${job.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, error, attempt: job.attempts, confirmed: status === "PRINTED", stationId: stationId.current }) });
    if (!response.ok) throw new Error("No se pudo confirmar el estado de la impresión.");
  }, []);

  const processJob = useCallback(async (job: PrintJob) => {
    if (processing.current) return;
    if (printers.find((printer) => printer.id === job.printerId)?.connectionType === "LOCAL_AGENT") { setMessage("Esta impresora usa el agente local. Revisa su conexión en Configuración."); return; }
    processing.current = job.id;
    if (simulation) { setCurrent(job); setMessage("Vista de prueba preparada. No se ha consumido ni confirmado la comanda."); return; }
    let claimed = false;
    try {
      const claimResponse = await fetch(`/api/operations/restaurant/print-jobs/${job.id}/claim`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stationId: stationId.current }) });
      if (!claimResponse.ok) throw new Error("No se pudo reservar la comanda para esta estación.");
      const claim = await claimResponse.json() as { claimed: boolean; attempt: number };
      if (!claim.claimed) { processing.current = null; return; }
      claimed = true;
      job = { ...job, attempts: claim.attempt };
      setCurrent(job);
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      for (let copy = 0; copy < Math.max(1, job.copies); copy += 1) window.print();
      setMessage("Revisa el papel y confirma el resultado. Cerrar el diálogo no confirma la impresión.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "No se pudo completar la impresión.";
      if (claimed) await updateStatus(job, "UNKNOWN", detail).catch(() => undefined);
      setMessage(detail); setCurrent(null); processing.current = null;
    }
  }, [simulation, updateStatus, printers]);

  async function confirmPrint(printed: boolean) {
    if (!current) return;
    try {
      if (!simulation) await updateStatus(current, printed ? "PRINTED" : "FAILED", printed ? undefined : "El operador canceló o no recibió la impresión.");
      setMessage(simulation ? "Vista de prueba cerrada; la comanda sigue pendiente." : printed ? "Impresión confirmada por el operador." : "Comanda pendiente de reimpresión.");
      setCurrent(null); processing.current = null;
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo confirmar. Reintenta sin volver a imprimir."); }
  }

  const loadJobs = useCallback(async () => {
    try {
      const response = await fetch(`/api/operations/restaurant/print-jobs${selectedPrinter ? `/${selectedPrinter}` : ""}`, { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo consultar la cola de impresión.");
      const payload = await response.json() as { jobs: PrintJob[] };
      setJobs(payload.jobs);
      const next = payload.jobs.filter((job) => job.claimable && job.automatic && (!job.printerId || printers.some((printer) => printer.id === job.printerId && printer.connectionType === "BROWSER"))).sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))[0];
      if (enabled && !simulation && next && printers.find((printer) => printer.id === selectedPrinter)?.connectionType !== "LOCAL_AGENT") await processJob(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "La estación perdió conexión.");
    }
  }, [enabled, processJob, selectedPrinter, simulation, printers]);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadJobs(), 0);
    if (!enabled) return () => window.clearTimeout(initial);
    const timer = window.setInterval(() => void loadJobs(), 3_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [enabled, loadJobs]);

  function toggleEnabled(value: boolean) { setEnabled(value); window.localStorage.setItem("movendi-kitchen-print-enabled", String(value)); }
  function toggleSimulation(value: boolean) { setSimulation(value); window.localStorage.setItem("movendi-kitchen-print-simulation", String(value)); }
  function choosePrinter(value: string) { setSelectedPrinter(value); window.localStorage.setItem("movendi-kitchen-printer-id", value); }
  async function retry(job: PrintJob) { const response = await fetch(`/api/operations/restaurant/print-jobs/${job.id}/retry`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attempt: job.attempts }) }); if (!response.ok) { setMessage("No se pudo reenviar la comanda; actualiza la cola."); return; } setMessage("Comanda colocada nuevamente en la cola."); await loadJobs(); }

  const pending = jobs.filter((job) => job.claimable).length;
  const failed = jobs.filter((job) => job.status === "FAILED");
  const sent = jobs.filter((job) => job.status === "SENT" || job.status === "UNKNOWN");
  const manual = jobs.filter((job) => job.claimable && (!job.automatic || !enabled || simulation));
  return <>
    <Card className="kitchen-print-station">
      <div className="kitchen-print-station__identity"><span><Printer size={20} /></span><div><h2>Estación de impresión</h2><p>Envía comandas al navegador y confirma que salieron correctamente en papel.</p></div></div>
      <div className="kitchen-print-station__status"><StatusBadge tone={enabled ? "success" : "neutral"} dot>{enabled ? "Conectada" : "Desactivada"}</StatusBadge><small>{pending} pendientes · {failed.length} fallidas</small></div>
      <div className="kitchen-print-station__controls">{printers.length ? <label><span>Impresora</span><select value={selectedPrinter} disabled={Boolean(current)} onChange={(event) => choosePrinter(event.target.value)}>{printers.map((printer) => <option value={printer.id} key={printer.id}>{printer.name}</option>)}</select></label> : null}<label><input type="checkbox" checked={enabled} onChange={(event) => toggleEnabled(event.target.checked)} /><span>Abrir siguientes comandas</span></label><label><input type="checkbox" disabled={Boolean(current)} checked={simulation} onChange={(event) => toggleSimulation(event.target.checked)} /><span>Modo simulación</span></label><Button type="button" size="sm" variant="ghost" onClick={() => void loadJobs()}><RefreshCw size={14} />Actualizar</Button></div>
      {current ? <div className="kitchen-print-errors" role="group" aria-label="Confirmar impresión"><strong>{simulation ? "Prueba sin cambios" : `Confirma la impresión de ${current.order.code}`}</strong><p>{simulation ? "Elige Guardar como PDF en el diálogo del navegador. La cola no cambia y no se confirma salida en papel." : "Si cancelaste el diálogo, faltó papel o salió incompleta, elige No salió."}</p>{simulation ? <><Button type="button" onClick={() => window.print()}>Ver formato / guardar PDF</Button><Button type="button" onClick={() => void confirmPrint(false)}>Cerrar prueba</Button></> : <><Button type="button" onClick={() => void confirmPrint(true)}>Salió correctamente</Button><Button type="button" variant="secondary" onClick={() => void confirmPrint(false)}>No salió / cancelé</Button></>}</div> : null}
      {message ? <p className="kitchen-print-message" role="status"><CheckCircle2 size={15} />{message}</p> : null}
      {sent.length ? <div className="kitchen-print-errors"><strong>Enviadas o sin confirmar · Verificar papel</strong>{sent.map((job) => <div key={job.id}><span>{job.order.code} · {job.payload.printerName}</span><Button type="button" onClick={async () => { const response = await fetch(`/api/operations/restaurant/print-jobs/${job.id}/confirm-delivery`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ printed: true, attempt: job.attempts }) }); setMessage(response.ok ? "Salida en papel confirmada." : "No se pudo confirmar. Actualiza e intenta otra vez."); await loadJobs(); }}>Recibida en papel</Button><Button type="button" variant="secondary" onClick={async () => { const response = await fetch(`/api/operations/restaurant/print-jobs/${job.id}/confirm-delivery`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ printed: false, attempt: job.attempts }) }); setMessage(response.ok ? "Fallo registrado; verifica antes de reimprimir." : "No se pudo registrar el fallo."); await loadJobs(); }}>No salió</Button></div>)}</div> : null}
      {failed.length ? <div className="kitchen-print-errors"><strong><TriangleAlert size={15} />Impresiones pendientes de atención</strong>{failed.slice(0, 3).map((job) => <div key={job.id}><span><b>{typeLabels[job.type]} · {job.order.code}</b><small>{job.lastError || "No confirmada"}</small></span><Button type="button" size="sm" variant="secondary" onClick={() => void retry(job)}>Reimprimir</Button></div>)}</div> : null}
      {manual.length ? <div className="kitchen-print-errors"><strong><Printer size={15} />Impresiones manuales</strong>{manual.slice(0, 3).map((job) => <div key={job.id}><span><b>{typeLabels[job.type]} · {job.order.code}</b><small>{job.payload.printerName ?? "Impresora seleccionada"}</small></span><Button type="button" size="sm" variant="secondary" onClick={() => void processJob(job)}>Imprimir ahora</Button></div>)}</div> : null}
    </Card>
    {current ? createPortal(<section className={`thermal-receipt thermal-receipt--${current.type.toLowerCase()}`} aria-hidden="true"><header><strong>{businessName}</strong><b>{typeLabels[current.type]}</b></header><div className="thermal-receipt__meta">{(!current.payload.fields || current.payload.fields.includes("orderCode")) ? <span>{current.order.code}</span> : null}{(!current.payload.fields || current.payload.fields.includes("table")) ? <span>{current.order.tableName ?? (current.order.source === "DELIVERY" ? "DELIVERY" : current.order.source === "TEST" ? "CONFIGURACIÓN" : "PARA LLEVAR")}</span> : null}{(!current.payload.fields || current.payload.fields.includes("createdAt")) ? <span>{new Date(current.createdAt).toLocaleString("es-PE")}</span> : null}{(!current.payload.fields || current.payload.fields.includes("waiter")) ? <span>Atendió: {current.createdBy}</span> : null}</div>{current.type === "CANCELLATION" ? <h2>*** ANULACIÓN ***</h2> : null}{(current.payload.sections?.length ? current.payload.sections : [{ areaName: "General", items: current.payload.items ?? [] }]).map((section, sectionIndex) => <div className="thermal-receipt__section" key={`${section.areaName}-${sectionIndex}`}><h3>{section.areaName}</h3><ul>{section.items.map((item, index) => <li key={`${item.name}-${index}`}><b>{item.quantity} x</b><span>{item.name}{item.notes && (!current.payload.fields || current.payload.fields.includes("itemNotes")) ? <small>NOTA: {item.notes}</small> : null}</span></li>)}</ul></div>)}{(current.payload.orderNotes || current.order.notes) && (!current.payload.fields || current.payload.fields.includes("orderNotes")) ? <p className="thermal-receipt__notes">NOTA: {current.payload.orderNotes || current.order.notes}</p> : null}<footer>{current.payload.printerName ?? "Movendi Go"} · {current.copies} copia(s)</footer></section>, document.body) : null}
  </>;
}
