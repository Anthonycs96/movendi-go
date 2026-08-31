"use client";

import { type FormEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileCheck2, Upload } from "lucide-react";
import type { TransportData, TransportDocumentRequirement } from "@movendi/contracts";
import { Button, Card, DataTable, Dialog, Field, Input, PageHeader, Select } from "@/shared/components/ui";
import { formatShortDate } from "@/shared/lib/format";
import { Badge } from "./transport-ui";

type Owner = { id: string; type: string; name: string };

function DocumentUploadForm({ owners, requirements }: { owners: Owner[]; requirements: TransportDocumentRequirement[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedOwner, setSelectedOwner] = useState("");
  const formId = useId();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const [ownerType, ownerId] = String(data.get("owner") ?? "|").split("|");
    data.delete("owner");
    data.set("ownerType", ownerType);
    data.set("ownerId", ownerId);
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/transport/documents", { method: "POST", body: data });
      const payload = await response.json().catch(() => ({})) as { message?: string; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "No pudimos almacenar el documento.");
      setSuccess(payload.message ?? "Documento almacenado.");
      form.reset();
      setSelectedOwner("");
      setOpen(false);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos almacenar el documento.");
    } finally {
      setPending(false);
      window.setTimeout(() => setSuccess(""), 3500);
    }
  }

  return <>
    <Button type="button" onClick={() => { setOpen(true); setError(""); }}><Upload size={16} />Documento</Button>
    <Dialog open={open} title="Registrar documento" description="El archivo queda privado, aislado por empresa y validado antes de almacenarse." onClose={() => { if (!pending) setOpen(false); }} footer={<><Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" form={formId} loading={pending}>Guardar documento</Button></>}>
      <form id={formId} className="form-grid" onSubmit={submit}>
        <Field label="Titular"><Select name="owner" required value={selectedOwner} onChange={(event) => setSelectedOwner(event.target.value)}><option value="" disabled>Selecciona</option>{owners.map((item) => <option key={`${item.type}-${item.id}`} value={`${item.type}|${item.id}`}>{item.type} · {item.name}</option>)}</Select></Field>
        <Field label="Tipo"><Select name="type" required defaultValue="" disabled={!selectedOwner}><option value="" disabled>Selecciona</option>{requirements.filter((item) => item.active && item.ownerType === selectedOwner.split("|")[0]).map((item) => <option key={item.key} value={item.key}>{item.label}{item.required ? " · obligatorio" : ""}</option>)}</Select></Field>
        <Field label="Número"><Input name="number" /></Field>
        <Field label="Emisión"><Input name="issuedAt" type="date" /></Field>
        <Field label="Vencimiento"><Input name="expiresAt" type="date" /></Field>
        <Field label="Archivo privado" hint="PDF, JPEG, PNG o WebP. Máximo configurado: 10 MB."><Input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" /></Field>
        <Field label="Notas"><Input name="notes" /></Field>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </form>
    </Dialog>
    {success ? <div className="inline-toast" role="status">{success}</div> : null}
  </>;
}

function fileSize(bytes: number | null) {
  if (bytes == null) return "Archivo externo";
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function Documents({ data }: { data: TransportData }) {
  const owners = [...data.drivers.map((item) => ({ id: item.id, type: "DRIVER", name: item.fullName })), ...data.vehicles.map((item) => ({ id: item.id, type: "VEHICLE", name: item.plate })), ...data.trailers.map((item) => ({ id: item.id, type: "TRAILER", name: item.plate })), ...data.trips.map((item) => ({ id: item.id, type: "TRIP", name: item.code }))];
  return <>
    <PageHeader eyebrow="CUMPLIMIENTO" title="Documentos y vigencias" description={`Archivos privados, vigencias y alertas configurables a ${data.configuration.documents.defaultAlertDays} días.`} icon={FileCheck2} actions={<DocumentUploadForm owners={owners} requirements={data.configuration.documents.requirements} />} />
    <Card className="table-card"><DataTable rows={data.documents} rowKey={(row) => row.id} columns={[
      { key: "type", header: "Documento", cell: (row) => <span className="table-primary"><strong>{row.type}</strong><span>{row.number ?? "Sin número"}</span></span> },
      { key: "owner", header: "Titular", cell: (row) => `${row.ownerType} · ${owners.find((item) => item.id === row.ownerId)?.name ?? row.ownerId}` },
      { key: "issued", header: "Emisión", cell: (row) => row.issuedAt ? formatShortDate(row.issuedAt, true) : "—" },
      { key: "expires", header: "Vencimiento", sortValue: (row) => row.expiresAt, cell: (row) => row.expiresAt ? formatShortDate(row.expiresAt, true) : "Sin vencimiento" },
      { key: "file", header: "Archivo", cell: (row) => row.fileUrl ? <a className="document-file-link" href={row.fileUrl}><Download size={13} /><span><strong>{row.fileName ?? "Abrir archivo"}</strong><small>{fileSize(row.fileSizeBytes)}{row.scanStatus ? ` · ${row.scanStatus}` : ""}</small></span></a> : "Sin adjunto" },
      { key: "status", header: "Estado", cell: (row) => <Badge value={row.status} /> },
    ]} /></Card>
  </>;
}
