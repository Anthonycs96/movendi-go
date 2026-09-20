"use client";
import { useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Dialog } from "@/shared/components/ui";
import type { MinimarketData } from "@movendi/contracts";
import { CategoryField } from "./Categories";
import { BarcodeField } from "./barcode";
import { Input, n, s } from "./ui";
import type { RetailOperation } from "./use-operation";
import styles from "./MinimarketWorkspace.module.css";

const steps = ["Producto", "Precio", "Control"];

export function TaxClassification({ value = "UNCLASSIFIED" }: { value?: string }) {
  return <label>Clasificación tributaria<select name="taxCategory" defaultValue={value}><option value="UNCLASSIFIED">Pendiente de clasificar</option><option value="GRAVADA">Gravada</option><option value="EXONERADA">Exonerada</option><option value="INAFECTA">Inafecta</option></select></label>;
}

export function ProductWizard({ initialBarcode, categories, op, onClose }: { initialBarcode: string; categories: MinimarketData["categories"]; op: RetailOperation; onClose: () => void }) {
  const [step, setStep] = useState(0), [expiry, setExpiry] = useState(false);
  const formRef = useRef<HTMLFormElement>(null), titleRef = useRef<HTMLHeadingElement>(null);
  function move(next: number) {
    setStep(next);
    requestAnimationFrame(() => { titleRef.current?.focus(); titleRef.current?.scrollIntoView({ block: "nearest" }); });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (op.busy || op.pending) return;
    const form = event.currentTarget;
    const fields = [...form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(step < 2 ? `[data-step="${step}"] input, [data-step="${step}"] select` : "input, select")];
    const invalid = fields.find((field) => !field.checkValidity());
    if (invalid) {
      const targetStep = Number(invalid.closest("[data-step]")?.getAttribute("data-step") ?? step);
      setStep(targetStep);
      invalid.closest("details")?.setAttribute("open", "");
      requestAnimationFrame(() => invalid.reportValidity());
      return;
    }
    if (step < 2) { move(step + 1); return; }
    const f = new FormData(form);
    const result = await op.run("products", {
      name: s(f, "name"), sku: s(f, "sku"), category: s(f, "category"), taxCategory: s(f, "taxCategory"), unit: s(f, "unit"), minimumStock: n(f, "minimum"), trackExpiry: expiry, expiryAlertDays: expiry ? n(f, "expiryDays") : 30,
      presentations: [{ name: s(f, "presentation"), sku: s(f, "presentationSku"), barcode: s(f, "barcode"), factor: n(f, "factor"), priceCents: Math.round(n(f, "price") * 100), weighted: f.has("weighted") }],
    });
    if (result?.id) onClose();
  }
  return <Dialog open title="Nuevo producto" description={`Paso ${step + 1} de 3 · ${steps[step]}`} initialFocus="dialog" onClose={() => { if (!op.busy) onClose(); }} className={styles.productDialog} footer={<div className={styles.wizardActions}><button type="button" disabled={op.busy} onClick={() => step ? move(step - 1) : onClose()}>{step ? <ArrowLeft size={17} /> : null}{step ? "Atrás" : "Cancelar"}</button><button className={styles.dialogAction} type="submit" form="new-retail-product" disabled={op.busy || !!op.pending}>{op.busy ? "Guardando…" : step === 2 ? "Crear producto" : "Continuar"}{step === 2 ? <Check size={17} /> : <ArrowRight size={17} />}</button></div>}>
    <div className={styles.workspace}>
      <ol className={styles.wizardSteps} aria-label="Pasos de registro">{steps.map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined}><span>{index < step ? <Check size={14} /> : index + 1}</span>{label}</li>)}</ol>
      {op.error ? <p className={styles.error} role="alert">{op.error}</p> : null}
      <h3 ref={titleRef} tabIndex={-1} className={styles.wizardTitle}>{["Identifica tu producto", "Define cómo lo vendes", "Configura su inventario"][step]}</h3>
      <form ref={formRef} id="new-retail-product" noValidate onSubmit={submit}>
        <div hidden={step !== 0} data-step="0"><div className={styles.formFields}>
          <Input name="name" label="Nombre" /><Input name="sku" label="SKU" /><CategoryField categories={categories} />
          <label>Unidad base<select name="unit"><option value="UND">Unidad</option><option value="KG">Kilogramo</option><option value="L">Litro</option></select></label>
        </div></div>
        <div hidden={step !== 1} data-step="1"><div className={styles.formFields}>
          <Input name="price" label="Precio de venta" type="number" min="0" step="0.01" />
          <BarcodeField initial={initialBarcode} />
          <details className={styles.disclosure}><summary>Presentación y venta por peso</summary><div className={styles.formFields}>
            <Input name="presentation" label="Presentación" value="Unidad" />
            <Input name="factor" label="Unidades base por presentación" type="number" value={1} min="0.000001" step="0.000001" />
            <Input name="presentationSku" label="SKU de presentación (opcional)" required={false} />
            <label><input name="weighted" type="checkbox" />Permitir cantidades fraccionadas (peso/volumen)</label>
          </div></details>
        </div></div>
        <div hidden={step !== 2} data-step="2"><div className={styles.formFields}>
          <Input name="minimum" label="Stock mínimo" type="number" value={0} min="0" step="0.000001" />
          <label><input name="expiry" type="checkbox" checked={expiry} onChange={(event) => setExpiry(event.target.checked)} />Controlar lotes y vencimientos</label>
          <fieldset className={styles.optionalFields} hidden={!expiry} disabled={!expiry}><Input name="expiryDays" label="Alertar vencimiento con días de anticipación" type="number" min="0" max="3650" value={30} /></fieldset>
          <details className={styles.disclosure}><summary>Clasificación tributaria</summary><TaxClassification /></details>
          <p className={styles.muted}>El producto se crea sin existencias. Registra la mercadería desde Compras.</p>
        </div></div>
      </form>
    </div>
  </Dialog>;
}
