"use client";
import { FormEvent, useEffect, useState } from "react";
import { Button, Card, DataTable, Field, Input, OperationButton, OperationForm, Select } from "@/shared/components/ui";
import { formatCurrencyCents, formatDateTime } from "@/shared/lib/format";
import { localizeCode } from "@/shared/lib/localization";

type ElectronicDocument = { kind: string; series: string; number: number; status: string; lastError: string | null; pdfUrl: string | null; xmlUrl: string | null; cdrUrl: string | null };
function FiscalHistoryActions({ row, canIssue }: { row: Row; canIssue: boolean }) {
  const doc = row.electronicDocument;
  if (row.status === "REFUNDED") return null;
  return <div className="table-primary">
    {doc ? <><small>{doc.kind} {doc.series}-{doc.number} · {doc.status === "ISSUED" ? "Aceptado" : "Pendiente de aceptación"}</small>{(["pdfUrl", "xmlUrl", "cdrUrl"] as const).map((key) => doc[key] ? <a key={key} href={doc[key]!} target="_blank" rel="noreferrer">Ver {key.slice(0, 3).toUpperCase()}</a> : null)}{doc.lastError ? <small className="form-error">{doc.lastError}</small> : null}</> : null}
    {canIssue && row.status === "PAID" && doc?.status !== "ISSUED" ? <div className="table-actions"><OperationButton endpoint={`/api/operations/restaurant/sales/${row.id}/electronic-document`} method="POST" body={{ kind: doc?.kind ?? "BOLETA" }}>{doc ? "Consultar / reintentar" : "Boleta"}</OperationButton>{!doc ? <OperationButton endpoint={`/api/operations/restaurant/sales/${row.id}/electronic-document`} method="POST" body={{ kind: "FACTURA" }}>Factura</OperationButton> : null}</div> : null}
  </div>;
}

type RefundView = { id: string; reason: string; creditStatus: string; creditError?: string | null; pdfUrl?: string | null; xmlUrl?: string | null; cdrUrl?: string | null };
export function RefundActions({ sale, canRefund, canIssue }: { sale: { id: string; status: string; totalCents: number; refund: RefundView | null }; canRefund: boolean; canIssue: boolean }) {
  if (sale.refund) return <div className="table-primary"><strong>Devuelta · {formatCurrencyCents(sale.totalCents)}</strong><small>{sale.refund.reason}</small>{sale.refund.creditError ? <small role="alert" className="form-error">{sale.refund.creditError}</small> : null}{(["pdfUrl", "xmlUrl", "cdrUrl"] as const).map((key) => sale.refund?.[key] ? <a key={key} href={sale.refund[key]!} target="_blank" rel="noreferrer">Descargar {key.slice(0, 3).toUpperCase()} de la nota</a> : null)}{sale.refund.creditStatus !== "NOT_REQUIRED" ? <><small>Nota de crédito: {sale.refund.creditStatus === "ISSUED" ? "Aceptada" : "Pendiente de aceptación"}</small>{canIssue && sale.refund.creditStatus !== "ISSUED" ? <OperationButton method="POST" endpoint={`/api/operations/restaurant/sales/${sale.id}/credit-note`}>Emitir / consultar nota</OperationButton> : null}</> : null}</div>;
  return canRefund && sale.status === "PAID" ? <OperationForm title="Devolución total" triggerLabel="Devolver venta" triggerVariant="danger" endpoint={`/api/operations/restaurant/sales/${sale.id}/refund`} description={`Devuelve ${formatCurrencyCents(sale.totalCents)} por los medios de pago originales. El efectivo se registra como salida en la caja abierta. Para tarjeta o transferencia, realiza y verifica la devolución con el proveedor antes de confirmar.`} submitLabel="Registrar devolución total" transform={(form) => ({ reason: form.get("reason"), stockDisposition: form.get("stockDisposition"), paymentConfirmed: form.get("paymentConfirmed") === "on" })}>
    <Field label="Motivo"><Input name="reason" required minLength={5} maxLength={300} /></Field>
    <Field label="Destino de los insumos"><Select name="stockDisposition" defaultValue="WASTE"><option value="WASTE">Preparados / no recuperables: conservar consumo</option><option value="RESTOCK">Recuperables: reponer inventario</option></Select></Field>
    <label className="platform-check"><input type="checkbox" name="paymentConfirmed" required /><span>Confirmo la devolución del dinero por los medios originales y el destino de los insumos.</span></label>
  </OperationForm> : <span>{sale.status === "PAID" ? "Pagada" : sale.status}</span>;
}

type Row = { electronicDocument?: ElectronicDocument | null; id: string; code?: string; status?: string; totalCents?: number; createdAt?: string; openedAt?: string; closedAt?: string | null; openingCents?: number; expectedCents?: number; countedCents?: number | null; amountCents?: number; type?: string; reason?: string; openedBy?: { name: string }; closedBy?: { name: string } | null; createdBy?: { name: string }; refund?: RefundView | null; items?: Array<{ name: string; quantity: number; status: string; preparationAreaName: string }> };
type History = { rows: Row[]; total: number; page: number; pageSize: number };
export function RestaurantHistory({ initialKind, canRefund, canIssue }: { initialKind: "orders" | "sales"; canRefund: boolean; canIssue: boolean }) {
  const [kind, setKind] = useState<string>(initialKind);
  const [cashId, setCashId] = useState("");
  const [filters, setFilters] = useState({ q: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<History | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ kind, page: String(page), ...(cashId ? { cashId } : {}), ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) });
    void fetch(`/api/data/restaurant-history?${query}`, { signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "No se pudo cargar el historial.");
      setResult(data); setError("");
    }).catch((reason: Error) => { if (reason.name !== "AbortError") setError(reason.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, page, filters, cashId, revision]);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("restaurant-operation-completed", refresh);
    return () => window.removeEventListener("restaurant-operation-completed", refresh);
  }, []);
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    setLoading(true); setPage(1); setFilters({ q: String(form.get("q") ?? ""), from: String(form.get("from") ?? ""), to: String(form.get("to") ?? "") });
  }
  return <Card className="panel restaurant-history"><div className="panel__header"><div><span className="section-kicker">Consulta completa</span><h2>Historial de {kind === "orders" ? "pedidos" : kind === "cash" ? "cajas y cierres" : kind === "movements" ? "movimientos" : "ventas"}</h2></div><Button type="button" variant="secondary" onClick={() => { setLoading(true); setRevision((value) => value + 1); }}>Actualizar historial</Button></div>
    <form className="form-grid" onSubmit={search}>{initialKind === "sales" ? <Field label="Consultar"><Select value={kind} onChange={(event) => { setLoading(true); setKind(event.target.value); setPage(1); setCashId(""); }}><option value="sales">Ventas</option><option value="cash">Cajas y cierres</option><option value="movements">Movimientos de caja</option></Select></Field> : null}<Field label={kind === "movements" ? "Motivo" : "Código"}><Input name="q" disabled={kind === "cash"} /></Field><Field label="Desde"><Input type="date" name="from" /></Field><Field label="Hasta"><Input type="date" name="to" /></Field><Button loading={loading} type="submit">Buscar historial</Button></form>
    {cashId ? <p>Movimientos de la caja seleccionada. <Button variant="ghost" onClick={() => { setCashId(""); setLoading(true); }}>Ver todas las cajas</Button></p> : null}
    {error ? <p role="alert" className="form-error">{error}</p> : null}
    {loading ? <p role="status">Cargando historial…</p> : result && !error ? <><DataTable rows={result.rows} rowKey={(row) => row.id} paginationMode="external" columns={[
      { key: "code", header: "Registro / fecha", cell: (row) => <span className="table-primary"><strong>{row.code ?? (kind === "cash" ? "Caja" : row.type === "IN" ? "Ingreso" : "Salida")}</strong><small>{formatDateTime(row.createdAt ?? row.openedAt ?? "")}</small></span> },
      { key: "status", header: "Detalle", cell: (row) => <span className="table-primary"><strong>{row.status ? localizeCode(row.status) : row.reason}</strong>{row.items?.map((item, index) => <small key={index}>{item.quantity}× {item.name} · {item.preparationAreaName} · {localizeCode(item.status)}</small>)}{row.openedBy ? <small>Abrió: {row.openedBy.name} · Cerró: {row.closedBy?.name ?? "Pendiente"}{row.closedAt ? ` · ${formatDateTime(row.closedAt)}` : ""}</small> : null}{row.createdBy ? <small>{row.createdBy.name}</small> : null}</span> },
      { key: "total", header: "Importes", cell: (row) => kind === "cash" ? <span className="table-primary"><small>Apertura: {formatCurrencyCents(row.openingCents ?? 0)}</small><strong>Esperado: {formatCurrencyCents(row.expectedCents ?? 0)}</strong><small>Contado: {row.countedCents == null ? "Pendiente" : formatCurrencyCents(row.countedCents)}</small>{row.countedCents != null ? <small>Diferencia: {formatCurrencyCents(row.countedCents - (row.expectedCents ?? 0))}</small> : null}</span> : formatCurrencyCents(row.totalCents ?? row.amountCents ?? 0) },
      { key: "actions", header: "Acciones", cell: (row) => kind === "sales" ? <><FiscalHistoryActions row={row} canIssue={canIssue} /><RefundActions sale={{ id: row.id, status: row.status!, totalCents: row.totalCents!, refund: row.refund ?? null }} canRefund={canRefund} canIssue={canIssue} /></> : kind === "cash" ? <Button variant="secondary" onClick={() => { setCashId(row.id); setKind("movements"); setPage(1); setLoading(true); }}>Ver movimientos</Button> : "—" },
    ]} /><div className="pagination"><span>{result.total} registros · Página {page} de {Math.max(1, Math.ceil(result.total / result.pageSize))}</span><div><Button variant="secondary" disabled={page === 1} onClick={() => { setLoading(true); setPage(page - 1); }}>Anterior</Button><Button variant="secondary" disabled={page * result.pageSize >= result.total} onClick={() => { setLoading(true); setPage(page + 1); }}>Siguiente</Button></div></div></> : null}
  </Card>;
}
