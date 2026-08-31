"use client";

import { Plus, Trash2 } from "lucide-react";
import type { RestaurantCatalogOption, RestaurantConfiguration, RestaurantStatusOption } from "@movendi/contracts";
import { Button, Field, Input } from "@/shared/components/ui";

const normalizedKey = (value: string) => value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);

export function CatalogEditor({ title, items, onChange, requiredKeys = [] }: { title: string; items: RestaurantCatalogOption[]; onChange: (items: RestaurantCatalogOption[]) => void; requiredKeys?: string[] }) {
  const required = new Set(requiredKeys);
  const duplicates = new Set(items.filter((item, index) => items.findIndex((candidate) => candidate.key === item.key) !== index).map((item) => item.key));
  const update = (index: number, value: Partial<RestaurantCatalogOption>) => onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...value } : item));
  return <section className="config-visual-editor" aria-label={title}>
    <header><div><strong>{title}</strong><small>Agrega, desactiva o renombra opciones sin escribir códigos técnicos.</small></div><Button type="button" size="sm" variant="secondary" onClick={() => onChange([...items, { key: `NUEVO_${items.length + 1}`, label: "", active: true }])}><Plus size={14} />Agregar</Button></header>
    <div>{items.map((item, index) => <article key={`${item.key}-${index}`} className={duplicates.has(item.key) || !item.label.trim() ? "invalid" : ""}>
      <Field label="Nombre"><Input value={item.label} placeholder="Ej. Consumo en salón" onChange={(event) => update(index, { label: event.target.value, ...(item.key.startsWith("NUEVO_") ? { key: normalizedKey(event.target.value) || item.key } : {}) })} /></Field>
      <Field label="Código"><Input value={item.key} disabled={required.has(item.key)} onChange={(event) => update(index, { key: normalizedKey(event.target.value) })} /></Field>
      <label className="platform-check compact"><input type="checkbox" checked={item.active} onChange={(event) => update(index, { active: event.target.checked })} /><span><strong>Activa</strong><small>Disponible para seleccionar</small></span></label>
      <button type="button" className="remove-setup-row" disabled={required.has(item.key)} title={required.has(item.key) ? "Estado técnico obligatorio" : undefined} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Eliminar ${item.label || item.key}`}><Trash2 size={15} /></button>
    </article>)}</div>
    {duplicates.size ? <p className="setup-validation" role="alert">No pueden existir códigos duplicados: {[...duplicates].join(", ")}.</p> : null}
  </section>;
}

export function StatusEditor({ title, items, onChange, requiredKeys = [] }: { title: string; items: RestaurantStatusOption[]; onChange: (items: RestaurantStatusOption[]) => void; requiredKeys?: string[] }) {
  const required = new Set(requiredKeys);
  const update = (index: number, value: Partial<RestaurantStatusOption>) => onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...value } : item));
  const rename = (index: number, nextKey: string) => {
    const previous = items[index].key;
    const key = normalizedKey(nextKey);
    onChange(items.map((item, itemIndex) => ({ ...item, key: itemIndex === index ? key : item.key, allowedNext: item.allowedNext.map((value) => value === previous ? key : value) })));
  };
  const duplicates = new Set(items.filter((item, index) => items.findIndex((candidate) => candidate.key === item.key) !== index).map((item) => item.key));
  return <section className="config-visual-editor status-flow-editor" aria-label={title}>
    <header><div><strong>{title}</strong><small>Selecciona visualmente a qué estados puede avanzar cada registro.</small></div><Button type="button" size="sm" variant="secondary" onClick={() => onChange([...items, { key: `NUEVO_${items.length + 1}`, label: "", active: true, terminal: false, allowedNext: [] }])}><Plus size={14} />Agregar estado</Button></header>
    <div>{items.map((item, index) => <article key={`${item.key}-${index}`} className={duplicates.has(item.key) || !item.label.trim() ? "invalid" : ""}>
      <div className="config-status-main"><Field label="Estado"><Input value={item.label} onChange={(event) => update(index, { label: event.target.value })} /></Field><Field label="Código"><Input value={item.key} disabled={required.has(item.key)} onChange={(event) => rename(index, event.target.value)} /></Field><label className="platform-check compact"><input type="checkbox" checked={item.active} onChange={(event) => update(index, { active: event.target.checked })} /><span><strong>Activo</strong></span></label><label className="platform-check compact"><input type="checkbox" checked={item.terminal} onChange={(event) => update(index, { terminal: event.target.checked, allowedNext: event.target.checked ? [] : item.allowedNext })} /><span><strong>Final</strong></span></label><button type="button" className="remove-setup-row" disabled={required.has(item.key)} title={required.has(item.key) ? "Estado técnico obligatorio" : undefined} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index).map((candidate) => ({ ...candidate, allowedNext: candidate.allowedNext.filter((key) => key !== item.key) })))} aria-label={`Eliminar estado ${item.label || item.key}`}><Trash2 size={15} /></button></div>
      <fieldset disabled={item.terminal}><legend>Puede avanzar a</legend><div className="config-transition-options">{items.filter((candidate) => candidate.key !== item.key).map((candidate) => <label key={candidate.key} className={item.allowedNext.includes(candidate.key) ? "selected" : ""}><input type="checkbox" checked={item.allowedNext.includes(candidate.key)} onChange={(event) => update(index, { allowedNext: event.target.checked ? [...item.allowedNext, candidate.key] : item.allowedNext.filter((key) => key !== candidate.key) })} />{candidate.label || candidate.key}</label>)}</div></fieldset>
    </article>)}</div>
    {duplicates.size ? <p className="setup-validation" role="alert">Cada estado debe tener un código único.</p> : null}
  </section>;
}

type NotificationRule = RestaurantConfiguration["notifications"]["rules"][number];
const channels = [["IN_APP", "En la aplicación"], ["EMAIL", "Correo"], ["SMS", "SMS"], ["WEBHOOK", "Webhook"]] as const;

export function NotificationRulesEditor({ rules, onChange, roleKeys }: { rules: NotificationRule[]; onChange: (rules: NotificationRule[]) => void; roleKeys: string[] }) {
  const update = (index: number, value: Partial<NotificationRule>) => onChange(rules.map((rule, itemIndex) => itemIndex === index ? { ...rule, ...value } : rule));
  return <section className="config-visual-editor notification-rule-editor" aria-label="Reglas de notificación">
    <header><div><strong>Reglas de notificación</strong><small>Define el evento, destinatarios y canales sin escribir listas manuales.</small></div><Button type="button" size="sm" variant="secondary" onClick={() => onChange([...rules, { event: `EVENTO_${rules.length + 1}`, label: "", roleKeys: [], channels: ["IN_APP"], active: true }])}><Plus size={14} />Agregar alerta</Button></header>
    <div>{rules.map((rule, index) => <article key={`${rule.event}-${index}`}>
      <div className="config-status-main"><Field label="Nombre"><Input value={rule.label} onChange={(event) => update(index, { label: event.target.value })} /></Field><Field label="Evento"><Input value={rule.event} onChange={(event) => update(index, { event: normalizedKey(event.target.value) })} /></Field><label className="platform-check compact"><input type="checkbox" checked={rule.active} onChange={(event) => update(index, { active: event.target.checked })} /><span><strong>Activa</strong></span></label><button type="button" className="remove-setup-row" onClick={() => onChange(rules.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Eliminar alerta ${rule.label || rule.event}`}><Trash2 size={15} /></button></div>
      <fieldset><legend>Destinatarios</legend><div className="config-transition-options">{roleKeys.map((role) => <label key={role} className={rule.roleKeys.includes(role) ? "selected" : ""}><input type="checkbox" checked={rule.roleKeys.includes(role)} onChange={(event) => update(index, { roleKeys: event.target.checked ? [...rule.roleKeys, role] : rule.roleKeys.filter((key) => key !== role) })} />{role}</label>)}</div></fieldset>
      <fieldset><legend>Canales</legend><div className="config-transition-options">{channels.map(([key, label]) => <label key={key} className={rule.channels.includes(key) ? "selected" : ""}><input type="checkbox" checked={rule.channels.includes(key)} onChange={(event) => update(index, { channels: event.target.checked ? [...rule.channels, key] : rule.channels.filter((channel) => channel !== key) })} />{label}</label>)}</div></fieldset>
    </article>)}</div>
  </section>;
}
