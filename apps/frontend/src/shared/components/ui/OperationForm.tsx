"use client";

import { FormEvent, ReactNode, useId, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

async function responsePayload(response: Response) {
  return response.json().catch(() => ({})) as Promise<{ message?: string; error?: { message?: string; details?: { fieldErrors?: Record<string, string[]> } } }>;
}

export function OperationForm({ title, description, endpoint, method = "POST", triggerLabel, triggerIcon, triggerVariant = "primary", triggerSize = "md", submitLabel = "Guardar", children, transform, onSuccess, allowed = true }: {
  allowed?: boolean;
  onSuccess?: (message: string) => void;
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
  const [fieldErrors, setFieldErrors] = useState<Array<{ name: string; label: string; message: string }>>([]);
  const [success, setSuccess] = useState("");
  const formId = useId();
  const submitting = useRef(false);
  const operationRequest = useRef<{ payload: string; key: string } | null>(null);

  function close() {
    if (!pending) setOpen(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    const form = event.currentTarget;
    setPending(true);
    setError("");
    setFieldErrors([]);
    form.querySelectorAll('[aria-invalid="true"]').forEach((field) => { field.removeAttribute("aria-invalid"); field.removeAttribute("aria-describedby"); });
    const formData = new FormData(form);
    try {
      let body = transform ? transform(formData) : Object.fromEntries(formData.entries());
      if (/\/restaurant\/cash\/[^/]+\/movement$/.test(endpoint) && body && typeof body === "object") {
        const payload = JSON.stringify(body);
        if (operationRequest.current?.payload !== payload) operationRequest.current = { payload, key: crypto.randomUUID() };
        body = { ...body, idempotencyKey: operationRequest.current.key };
      }
      const response = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await responsePayload(response);
      if (!response.ok) {
        const errors = Object.entries(result.error?.details?.fieldErrors ?? {}).filter(([, messages]) => messages.length).map(([name, messages]) => {
          const field = form.querySelector<HTMLInputElement>(`[name="${CSS.escape(name)}"]`);
          field?.setAttribute("aria-invalid", "true");
          field?.setAttribute("aria-describedby", `${formId}-errors`);
          const label = field?.labels?.[0]?.textContent?.trim() || field?.closest("label")?.textContent?.trim() || name;
          return { name, label, message: messages.some((message) => /[áéíóúñ]|Ingresa|Selecciona|debe/i.test(message)) ? messages.join(". ") : "Revisa el valor, el formato y la longitud de este campo." };
        });
        setFieldErrors(errors);
        if (errors[0]) form.querySelector<HTMLInputElement>(`[name="${CSS.escape(errors[0].name)}"]`)?.focus();
        throw new Error(result.error?.message ?? "No pudimos guardar los cambios.");
      }
      const message = result.message ?? "Cambios guardados.";
      if (onSuccess) onSuccess(message);
      else setSuccess(message);
      operationRequest.current = null;
      form.reset();
      setOpen(false);
      router.refresh();
      window.dispatchEvent(new Event("restaurant-operation-completed"));
      window.setTimeout(() => setSuccess(""), 3500);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos guardar los cambios.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  if (!allowed) return null;

  return <>
    <Button type="button" variant={triggerVariant} size={triggerSize} onClick={() => { setOpen(true); setError(""); setFieldErrors([]); }}>{triggerIcon ?? <Plus size={16} />}{triggerLabel}</Button>
    <Dialog
      open={open}
      title={title}
      description={description}
      onClose={close}
      footer={<><Button variant="ghost" type="button" disabled={pending} onClick={close}>Cancelar</Button><Button type="submit" form={formId} loading={pending}>{submitLabel}</Button></>}
    >
      <form id={formId} className="form-grid" onSubmit={submit}>{children}{error ? <div id={`${formId}-errors`} className="form-error" role="alert"><p>{error}</p>{fieldErrors.length ? <ul>{fieldErrors.map((field) => <li key={field.name}><button type="button" className="field-error-link" onClick={() => document.getElementById(formId)?.querySelector<HTMLInputElement>(`[name="${CSS.escape(field.name)}"]`)?.focus()}>{field.label}: {field.message}</button></li>)}</ul> : null}</div> : null}</form>
    </Dialog>
    {success ? <div className="inline-toast" role="status"><CheckCircle2 size={17} />{success}</div> : null}
  </>;
}

export function OperationButton({ endpoint, body, children, method = "PATCH", variant = "secondary", confirmMessage }: { endpoint: string; body?: unknown; children: ReactNode; method?: "POST" | "PATCH"; variant?: "primary" | "secondary" | "ghost" | "danger"; confirmMessage?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  async function run() {
    if (submitting.current) return;
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    submitting.current = true;
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const result = await responsePayload(response);
      setFailed(!response.ok);
      setMessage(response.ok ? result.message ?? "Acción completada." : result.error?.message ?? "No pudimos completar la acción.");
      if (response.ok) { router.refresh(); window.dispatchEvent(new Event("restaurant-operation-completed")); }
    } catch {
      setFailed(true);
      setMessage("No pudimos conectar con el servidor. Inténtalo nuevamente.");
    } finally {
      submitting.current = false;
      setPending(false);
      window.setTimeout(() => setMessage(""), 3500);
    }
  }
  return <span className="operation-action"><Button type="button" size="sm" variant={variant} loading={pending} onClick={run}>{children}</Button>{message ? <span className="action-message" role={failed ? "alert" : "status"}>{failed ? <AlertCircle size={13} /> : null}{message}</span> : null}</span>;
}
