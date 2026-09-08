"use client";

import { useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, Input } from "@/shared/components/ui";
import { nextDraftConfigurationCode, uniqueConfigurationCodeFromLabel } from "@/shared/lib/configuration-codes";

type CatalogOption = { key: string; label: string; active: boolean };
type StatusOption = CatalogOption & { terminal: boolean; allowedNext: string[] };
type NotificationRule = { event: string; label: string; roleKeys: string[]; channels: string[]; active: boolean };

export function CatalogEditor({ title, items, onChange, requiredKeys = [] }: { title: string; items: CatalogOption[]; onChange: (items: CatalogOption[]) => void; requiredKeys?: string[] }) {
  const required = new Set(requiredKeys);
  const automaticRows = useRef(new Set<number>());
  const duplicates = new Set(items.filter((item, index) => items.findIndex((candidate) => candidate.key === item.key) !== index).map((item) => item.key));
  const update = (index: number, value: Partial<CatalogOption>) => onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...value } : item));
  const add = () => {
    const index = items.length;
    automaticRows.current.add(index);
    onChange([...items, { key: nextDraftConfigurationCode(items.map((item) => item.key)), label: "", active: true }]);
  };
  const updateLabel = (index: number, label: string) => update(index, {
    label,
    ...(automaticRows.current.has(index) ? { key: uniqueConfigurationCodeFromLabel(label, items.filter((_, itemIndex) => itemIndex !== index).map((item) => item.key)) || items[index].key } : {}),
  });
  const remove = (index: number) => {
    automaticRows.current = new Set([...automaticRows.current].flatMap((itemIndex) => itemIndex === index ? [] : [itemIndex > index ? itemIndex - 1 : itemIndex]));
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  };
  return <section className="config-visual-editor" aria-label={title}>
    <header><div><strong>{title}</strong><small>Escribe el nombre; MOVENDI GO genera y protege el código interno.</small></div><Button type="button" size="sm" variant="secondary" onClick={add}><Plus size={14} />Agregar</Button></header>
    <div>{items.map((item, index) => <article key={`${title}-${index}`} className={duplicates.has(item.key) || !item.label.trim() ? "invalid" : ""}>
      <Field label="Nombre"><Input value={item.label} placeholder="Ej. Servicio local" onChange={(event) => updateLabel(index, event.target.value)} /></Field>
      <Field label="Código interno (automático)"><Input value={item.key} readOnly aria-readonly="true" title="Se genera automáticamente y no se puede editar" /></Field>
      <label className="platform-check compact"><input type="checkbox" checked={item.active} onChange={(event) => update(index, { active: event.target.checked })} /><span><strong>Activa</strong><small>Disponible para seleccionar</small></span></label>
      <button type="button" className="remove-setup-row" disabled={required.has(item.key)} title={required.has(item.key) ? "Valor técnico obligatorio" : undefined} onClick={() => remove(index)} aria-label={`Eliminar ${item.label || item.key}`}><Trash2 size={15} /></button>
    </article>)}</div>
    {duplicates.size ? <p className="setup-validation" role="alert">No pueden existir códigos duplicados: {[...duplicates].join(", ")}.</p> : null}
  </section>;
}

export function StatusEditor({ title, items, onChange, requiredKeys = [] }: { title: string; items: StatusOption[]; onChange: (items: StatusOption[]) => void; requiredKeys?: string[] }) {
  const required = new Set(requiredKeys);
  const automaticRows = useRef(new Set<number>());
  const update = (index: number, value: Partial<StatusOption>) => onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...value } : item));
  const updateLabel = (index: number, label: string) => {
    const previous = items[index].key;
    const key = automaticRows.current.has(index) ? uniqueConfigurationCodeFromLabel(label, items.filter((_, itemIndex) => itemIndex !== index).map((item) => item.key)) || previous : previous;
    onChange(items.map((item, itemIndex) => ({ ...item, label: itemIndex === index ? label : item.label, key: itemIndex === index ? key : item.key, allowedNext: item.allowedNext.map((value) => value === previous ? key : value) })));
  };
  const add = () => {
    const index = items.length;
    automaticRows.current.add(index);
    onChange([...items, { key: nextDraftConfigurationCode(items.map((item) => item.key), "ESTADO"), label: "", active: true, terminal: false, allowedNext: [] }]);
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

const channels = [["IN_APP", "En la aplicación"], ["EMAIL", "Correo"], ["SMS", "SMS"], ["WEBHOOK", "Webhook"]] as const;

export function NotificationRulesEditor({ rules, onChange, roleKeys, availableChannels }: { availableChannels?: string[]; rules: NotificationRule[]; onChange: (rules: NotificationRule[]) => void; roleKeys: string[] }) {
  const automaticRows = useRef(new Set<number>());
  const update = (index: number, value: Partial<NotificationRule>) => onChange(rules.map((rule, itemIndex) => itemIndex === index ? { ...rule, ...value } : rule));
  const updateLabel = (index: number, label: string) => update(index, {
    label,
    ...(automaticRows.current.has(index) ? { event: uniqueConfigurationCodeFromLabel(label, rules.filter((_, itemIndex) => itemIndex !== index).map((rule) => rule.event)) || rules[index].event } : {}),
  });
  const add = () => {
    const index = rules.length;
    automaticRows.current.add(index);
    onChange([...rules, { event: nextDraftConfigurationCode(rules.map((rule) => rule.event), "EVENTO"), label: "", roleKeys: [], channels: ["IN_APP"], active: true }]);
  };
  const remove = (index: number) => {
    automaticRows.current = new Set([...automaticRows.current].flatMap((itemIndex) => itemIndex === index ? [] : [itemIndex > index ? itemIndex - 1 : itemIndex]));
    onChange(rules.filter((_, itemIndex) => itemIndex !== index));
  };
  return <section className="config-visual-editor notification-rule-editor" aria-label="Reglas de notificación">
    <header><div><strong>Reglas de notificación</strong><small>Define el nombre, destinatarios y canales; el evento interno se genera automáticamente.</small></div><Button type="button" size="sm" variant="secondary" onClick={add}><Plus size={14} />Agregar alerta</Button></header>
    <div>{rules.map((rule, index) => <article key={`notification-${index}`}>
      <div className="config-status-main"><Field label="Nombre"><Input value={rule.label} onChange={(event) => updateLabel(index, event.target.value)} /></Field><Field label="Evento interno (automático)"><Input value={rule.event} readOnly aria-readonly="true" title="Se genera automáticamente y no se puede editar" /></Field><label className="platform-check compact"><input type="checkbox" checked={rule.active} onChange={(event) => update(index, { active: event.target.checked })} /><span><strong>Activa</strong></span></label><button type="button" className="remove-setup-row" onClick={() => remove(index)} aria-label={`Eliminar alerta ${rule.label || rule.event}`}><Trash2 size={15} /></button></div>
      <fieldset><legend>Destinatarios</legend><div className="config-transition-options">{roleKeys.map((role) => <label key={role} className={rule.roleKeys.includes(role) ? "selected" : ""}><input type="checkbox" checked={rule.roleKeys.includes(role)} onChange={(event) => update(index, { roleKeys: event.target.checked ? [...rule.roleKeys, role] : rule.roleKeys.filter((key) => key !== role) })} />{role}</label>)}</div></fieldset>
      <fieldset><legend>Canales</legend><div className="config-transition-options">{channels.map(([key, label]) => <label key={key} className={rule.channels.includes(key) ? "selected" : ""}><input type="checkbox" disabled={availableChannels ? !availableChannels.includes(key) : false} checked={rule.channels.includes(key) && (!availableChannels || availableChannels.includes(key))} onChange={(event) => update(index, { channels: event.target.checked ? [...rule.channels, key] : rule.channels.filter((channel) => channel !== key) })} />{label}{availableChannels && !availableChannels.includes(key) ? " (no disponible)" : ""}</label>)}</div></fieldset>
    </article>)}</div>
  </section>;
}
