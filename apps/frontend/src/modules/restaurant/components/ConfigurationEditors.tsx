"use client";

import { useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { RestaurantCatalogOption, RestaurantConfiguration, RestaurantStatusOption } from "@movendi/contracts";
import { Button, Field, Input } from "@/shared/components/ui";
import { configurationCodeFromLabel, nextDraftConfigurationCode } from "../lib/configuration-codes";

export function CatalogEditor({ title, items, onChange, requiredKeys = [] }: { title: string; items: RestaurantCatalogOption[]; onChange: (items: RestaurantCatalogOption[]) => void; requiredKeys?: string[] }) {
  const required = new Set(requiredKeys);
  const automaticRows = useRef(new Set<number>());
  const duplicates = new Set(items.filter((item, index) => items.findIndex((candidate) => candidate.key === item.key) !== index).map((item) => item.key));
  const update = (index: number, value: Partial<RestaurantCatalogOption>) => onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...value } : item));
  const add = () => {
    const index = items.length;
    automaticRows.current.add(index);
    onChange([...items, { key: nextDraftConfigurationCode(items.map((item) => item.key)), label: "", active: true }]);
  };
  const updateLabel = (index: number, label: string) => update(index, {
    label,
    ...(automaticRows.current.has(index) ? { key: configurationCodeFromLabel(label) || items[index].key } : {}),
  });
  const remove = (index: number) => {
    automaticRows.current = new Set([...automaticRows.current].flatMap((itemIndex) => itemIndex === index ? [] : [itemIndex > index ? itemIndex - 1 : itemIndex]));
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  };
  return <section className="config-visual-editor" aria-label={title}>
    <header><div><strong>{title}</strong><small>Escribe el nombre; MOVENDI GO genera y protege el código interno.</small></div><Button type="button" size="sm" variant="secondary" onClick={add}><Plus size={14} />Agregar</Button></header>
    <div>{items.map((item, index) => <article key={`${title}-${index}`} className={duplicates.has(item.key) || !item.label.trim() ? "invalid" : ""}>
      <Field label="Nombre"><Input value={item.label} placeholder="Ej. Consumo en salón" onChange={(event) => updateLabel(index, event.target.value)} /></Field>
      <Field label="Código interno (automático)"><Input value={item.key} readOnly aria-readonly="true" title="Se genera automáticamente y no se puede editar" /></Field>
      <label className="platform-check compact"><input type="checkbox" checked={item.active} onChange={(event) => update(index, { active: event.target.checked })} /><span><strong>Activa</strong><small>Disponible para seleccionar</small></span></label>
      <button type="button" className="remove-setup-row" disabled={required.has(item.key)} title={required.has(item.key) ? "Estado técnico obligatorio" : undefined} onClick={() => remove(index)} aria-label={`Eliminar ${item.label || item.key}`}><Trash2 size={15} /></button>
    </article>)}</div>
    {duplicates.size ? <p className="setup-validation" role="alert">No pueden existir códigos duplicados: {[...duplicates].join(", ")}.</p> : null}
  </section>;
}

export function StatusEditor({ title, items, onChange, requiredKeys = [] }: { title: string; items: RestaurantStatusOption[]; onChange: (items: RestaurantStatusOption[]) => void; requiredKeys?: string[] }) {
  const required = new Set(requiredKeys);
  const automaticRows = useRef(new Set<number>());
  const update = (index: number, value: Partial<RestaurantStatusOption>) => onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...value } : item));
  const updateLabel = (index: number, label: string) => {
    const previous = items[index].key;
    const key = automaticRows.current.has(index) ? configurationCodeFromLabel(label) || previous : previous;
    onChange(items.map((item, itemIndex) => ({ ...item, label: itemIndex === index ? label : item.label, key: itemIndex === index ? key : item.key, allowedNext: item.allowedNext.map((value) => value === previous ? key : value) })));
  };
  const add = () => {
    const index = items.length;
    automaticRows.current.add(index);
    onChange([...items, { key: nextDraftConfigurationCode(items.map((item) => item.key)), label: "", active: true, terminal: false, allowedNext: [] }]);
  };
  const remove = (index: number) => {
    const removedKey = items[index].key;
    automaticRows.current = new Set([...automaticRows.current].flatMap((itemIndex) => itemIndex === index ? [] : [itemIndex > index ? itemIndex - 1 : itemIndex]));
    onChange(items.filter((_, itemIndex) => itemIndex !== index).map((candidate) => ({ ...candidate, allowedNext: candidate.allowedNext.filter((key) => key !== removedKey) })));
  };
  const duplicates = new Set(items.filter((item, index) => items.findIndex((candidate) => candidate.key === item.key) !== index).map((item) => item.key));
  return <section className="config-visual-editor status-flow-editor" aria-label={title}>
    <header><div><strong>{title}</strong><small>Define el nombre y las transiciones; el código interno se genera automáticamente.</small></div><Button type="button" size="sm" variant="secondary" onClick={add}><Plus size={14} />Agregar estado</Button></header>
    <div>{items.map((item, index) => <article key={`${title}-${index}`} className={duplicates.has(item.key) || !item.label.trim() ? "invalid" : ""}>
      <div className="config-status-main"><Field label="Estado"><Input value={item.label} onChange={(event) => updateLabel(index, event.target.value)} /></Field><Field label="Código interno (automático)"><Input value={item.key} readOnly aria-readonly="true" title="Se genera automáticamente y no se puede editar" /></Field><label className="platform-check compact"><input type="checkbox" checked={item.active} onChange={(event) => update(index, { active: event.target.checked })} /><span><strong>Activo</strong></span></label><label className="platform-check compact"><input type="checkbox" checked={item.terminal} onChange={(event) => update(index, { terminal: event.target.checked, allowedNext: event.target.checked ? [] : item.allowedNext })} /><span><strong>Final</strong></span></label><button type="button" className="remove-setup-row" disabled={required.has(item.key)} title={required.has(item.key) ? "Estado técnico obligatorio" : undefined} onClick={() => remove(index)} aria-label={`Eliminar estado ${item.label || item.key}`}><Trash2 size={15} /></button></div>
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
      <div className="config-status-main"><Field label="Nombre"><Input value={rule.label} onChange={(event) => update(index, { label: event.target.value })} /></Field><Field label="Evento"><Input value={rule.event} onChange={(event) => update(index, { event: configurationCodeFromLabel(event.target.value) })} /></Field><label className="platform-check compact"><input type="checkbox" checked={rule.active} onChange={(event) => update(index, { active: event.target.checked })} /><span><strong>Activa</strong></span></label><button type="button" className="remove-setup-row" onClick={() => onChange(rules.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Eliminar alerta ${rule.label || rule.event}`}><Trash2 size={15} /></button></div>
      <fieldset><legend>Destinatarios</legend><div className="config-transition-options">{roleKeys.map((role) => <label key={role} className={rule.roleKeys.includes(role) ? "selected" : ""}><input type="checkbox" checked={rule.roleKeys.includes(role)} onChange={(event) => update(index, { roleKeys: event.target.checked ? [...rule.roleKeys, role] : rule.roleKeys.filter((key) => key !== role) })} />{role}</label>)}</div></fieldset>
      <fieldset><legend>Canales</legend><div className="config-transition-options">{channels.map(([key, label]) => <label key={key} className={rule.channels.includes(key) ? "selected" : ""}><input type="checkbox" checked={rule.channels.includes(key)} onChange={(event) => update(index, { channels: event.target.checked ? [...rule.channels, key] : rule.channels.filter((channel) => channel !== key) })} />{label}</label>)}</div></fieldset>
    </article>)}</div>
  </section>;
}
