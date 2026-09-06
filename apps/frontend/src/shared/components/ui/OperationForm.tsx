"use client";

import { FormEvent, ReactNode, useId, useState } from "react";
import { AlertCircle, CheckCircle2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

async function responsePayload(response: Response) {
  return response.json().catch(() => ({})) as Promise<{ message?: string; error?: { message?: string } }>;
}

export function OperationForm({ title, description, endpoint, method = "POST", triggerLabel, triggerIcon, triggerVariant = "primary", triggerSize = "md", submitLabel = "Guardar", children, transform }: {
  title: string;
  description?: string;
  endpoint: string;
  method?: "POST" | "PATCH";
  triggerLabel: string;
  triggerIcon?: ReactNode;
  triggerVariant?: "primary" | "secondary" | "ghost" | "danger";
  triggerSize?: "sm" | "md" | "lg";
  submitLabel?: string;
  children: ReactNode;
  transform?: (formData: FormData) => unknown;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const formId = useId();

  function close() {
    if (!pending) setOpen(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setError("");
    const formData = new FormData(form);
    const body = transform ? transform(formData) : Object.fromEntries(formData.entries());
    try {
      const response = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await responsePayload(response);
      if (!response.ok) throw new Error(result.error?.message ?? "No pudimos guardar los cambios.");
      setSuccess(result.message ?? "Cambios guardados.");
      form.reset();
      setOpen(false);
      router.refresh();
      window.setTimeout(() => setSuccess(""), 3500);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos guardar los cambios.");
    } finally {
      setPending(false);
    }
  }

  return <>
    <Button type="button" variant={triggerVariant} size={triggerSize} onClick={() => { setOpen(true); setError(""); }}>{triggerIcon ?? <Plus size={16} />}{triggerLabel}</Button>
    <Dialog
      open={open}
      title={title}
      description={description}
      onClose={close}
      footer={<><Button variant="ghost" type="button" disabled={pending} onClick={close}>Cancelar</Button><Button type="submit" form={formId} loading={pending}>{submitLabel}</Button></>}
    >
      <form id={formId} className="form-grid" onSubmit={submit}>{children}{error ? <p className="form-error" role="alert">{error}</p> : null}</form>
    </Dialog>
    {success ? <div className="inline-toast" role="status"><CheckCircle2 size={17} />{success}</div> : null}
  </>;
}

export function OperationButton({ endpoint, body, children, method = "PATCH", variant = "secondary", confirmMessage }: { endpoint: string; body?: unknown; children: ReactNode; method?: "POST" | "PATCH"; variant?: "primary" | "secondary" | "ghost" | "danger"; confirmMessage?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function run() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const result = await responsePayload(response);
      setFailed(!response.ok);
      setMessage(response.ok ? result.message ?? "Acción completada." : result.error?.message ?? "No pudimos completar la acción.");
      if (response.ok) router.refresh();
    } catch {
      setFailed(true);
      setMessage("No pudimos conectar con el servidor. Inténtalo nuevamente.");
    } finally {
      setPending(false);
      window.setTimeout(() => setMessage(""), 3500);
    }
  }
  return <span className="operation-action"><Button type="button" size="sm" variant={variant} loading={pending} onClick={run}>{children}</Button>{message ? <span className="action-message" role={failed ? "alert" : "status"}>{failed ? <AlertCircle size={13} /> : null}{message}</span> : null}</span>;
}
