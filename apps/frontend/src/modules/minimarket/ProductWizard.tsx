"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, CheckCircle2, Plus, Sparkles } from "lucide-react";
import { Dialog } from "@/shared/components/ui";
import type { MinimarketData } from "@movendi/contracts";
import { CategoryField } from "./Categories";
import { BarcodeField } from "./barcode";
import { Input, n, s } from "./ui";
import type { RetailOperation } from "./use-operation";
import styles from "./MinimarketWorkspace.module.css";

const unitNames = { UND: "Unidad", KG: "Kilogramo", L: "Litro" };
type Unit = keyof typeof unitNames;

export function TaxClassification({ value = "UNCLASSIFIED" }: { value?: string }) {
  return <label>Clasificación tributaria<select name="taxCategory" defaultValue={value}><option value="UNCLASSIFIED">Pendiente de clasificar</option><option value="GRAVADA">Gravada</option><option value="EXONERADA">Exonerada</option><option value="INAFECTA">Inafecta</option></select></label>;
}

export function ProductWizard({ initialBarcode, categories, op, onClose }: { initialBarcode: string; categories: MinimarketData["categories"]; op: RetailOperation; onClose: () => void }) {
  const [expiry, setExpiry] = useState(false), [unit, setUnit] = useState<Unit>("UND"), [weighted, setWeighted] = useState(false);
  const [presentation, setPresentation] = useState("Unidad"), [category, setCategory] = useState("General"), [draft, setDraft] = useState(0);
  const [created, setCreated] = useState<{ name: string; sku?: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null), sending = useRef(false), focusNext = useRef(false);
  const disabled = op.busy || !!op.pending;
  useEffect(() => {
    if (disabled || !focusNext.current) return;
    const frame = requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLInputElement>('[name="name"]')?.focus();
      focusNext.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [draft, disabled]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || op.busy || op.pending) return;
    const form = event.currentTarget;
    const fields = [...form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")];
    const invalid = fields.find((field) => !field.checkValidity());
    if (invalid) {
      // Reveal every collapsed group containing the invalid field before focusing it.
      let parent = invalid.parentElement;
      while (parent && parent !== form) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; }
      requestAnimationFrame(() => { invalid.focus(); invalid.reportValidity(); });
      return;
    }
    const another = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "another";
    const f = new FormData(form);
    sending.current = true;
    try {
      const result = await op.run("products", {
        name: s(f, "name"), sku: s(f, "sku"), category: s(f, "category"), taxCategory: s(f, "taxCategory"), unit,
        minimumStock: n(f, "minimum"), trackExpiry: expiry, expiryAlertDays: expiry ? n(f, "expiryDays") : 30,
        presentations: [{ name: presentation, sku: s(f, "presentationSku"), barcode: s(f, "barcode"), factor: n(f, "factor"), priceCents: Math.round(n(f, "price") * 100), weighted }],
      });
      if (!result?.id) return;
      if (!another) { onClose(); return; }
      setCreated({ name: s(f, "name"), sku: result.sku });
      setCategory(s(f, "category")); setExpiry(false); setWeighted(unit !== "UND"); setPresentation(unitNames[unit]);
      focusNext.current = true; setDraft((value) => value + 1);
    } finally { sending.current = false; }
  }
  return <Dialog open title="Nuevo producto" description="Solo necesitas el nombre y el precio." onClose={() => { if (!op.busy && !sending.current) onClose(); }} className={styles.productDialog} footer={<div className={styles.quickProductActions}>
    <button type="button" disabled={op.busy} onClick={onClose}>Cancelar</button>
    <button className={styles.dialogAction} type="submit" form="new-retail-product" value="close" disabled={disabled}>{op.busy ? "Guardando…" : "Crear producto"}<Check size={17} /></button>
    <button type="submit" form="new-retail-product" value="another" disabled={disabled}><Plus size={16} />Guardar y crear otro</button>
  </div>}>
    <div className={styles.workspace}>
      {created ? <div className={styles.quickProductSuccess} role="status"><CheckCircle2 size={20} /><div><strong>{created.name} guardado</strong><small>{created.sku ? `Código interno: ${created.sku}. ` : ""}Puedes registrar el siguiente.</small></div></div> : null}
      {op.error ? <p className={styles.error} role="alert">{op.error}</p> : null}
      <form key={draft} ref={formRef} id="new-retail-product" noValidate onSubmit={submit} className={styles.quickProductForm}>
        <fieldset disabled={disabled} className={styles.quickProductFields}>
          <div className={styles.formFields}>
            <label>Nombre<input name="name" required maxLength={120} placeholder="Ej. Leche entera 1 litro" autoComplete="off" /></label>
            <div className={styles.quickProductPrice}><label>Precio de venta<input name="price" type="number" required min="0" max="21474836.47" step="0.01" inputMode="decimal" placeholder="0.00" aria-describedby="new-product-price-unit" /></label><small id="new-product-price-unit">Por {unitNames[unit].toLowerCase()}</small></div>
          </div>
          <p className={styles.quickProductDefaults}><Sparkles size={16} />El código interno (SKU) se genera si lo dejas vacío.</p>
          <div className={styles.quickProductBarcode}><BarcodeField initial={draft === 0 ? initialBarcode : ""} /><small>Opcional: escanea el envase o déjalo vacío si no tiene código.</small></div>
          <details className={styles.disclosure}><summary>Más detalles (opcional)</summary><div className={styles.formFields}>
            <CategoryField categories={categories} value={category} />
            <label>Unidad base<select name="unit" value={unit} onChange={(event) => { const next = event.target.value as Unit; setUnit(next); setWeighted(next !== "UND"); setPresentation((value) => value === unitNames[unit] ? unitNames[next] : value); }}><option value="UND">Unidad</option><option value="KG">Kilogramo</option><option value="L">Litro</option></select></label>
            <Input name="sku" label="SKU propio (opcional)" required={false} />
            <details className={styles.disclosure}><summary>Presentación y venta por peso</summary><div className={styles.formFields}>
              <label>Presentación<input name="presentation" value={presentation} required maxLength={120} onChange={(event) => setPresentation(event.target.value)} /></label>
              <Input name="factor" label="Unidades base por presentación" type="number" value={1} min="0.000001" step="0.000001" />
              <Input name="presentationSku" label="SKU de presentación (opcional)" required={false} />
              <label><input name="weighted" type="checkbox" checked={weighted} onChange={(event) => setWeighted(event.target.checked)} disabled={unit === "UND"} />Permitir cantidades fraccionadas (peso/volumen)</label>
            </div></details>
            <details className={styles.disclosure}><summary>Inventario y vencimientos</summary><div className={styles.formFields}>
              <Input name="minimum" label="Stock mínimo" type="number" value={0} min="0" step="0.000001" />
              <label><input name="expiry" type="checkbox" checked={expiry} onChange={(event) => setExpiry(event.target.checked)} />Controlar lotes y vencimientos</label>
              <fieldset className={styles.optionalFields} hidden={!expiry} disabled={!expiry}><Input name="expiryDays" label="Alertar vencimiento con días de anticipación" type="number" min="0" max="3650" value={30} /></fieldset>
            </div></details>
            <details className={styles.disclosure}><summary>Clasificación tributaria</summary><TaxClassification /></details>
          </div></details>
          <p className={styles.quickProductHint}>Se crea sin existencias. Registra la mercadería desde Compras.</p>
        </fieldset>
      </form>
    </div>
  </Dialog>;
}
