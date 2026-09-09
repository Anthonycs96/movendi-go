"use client";

import { Children, cloneElement, isValidElement, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, useDeferredValue, useId, useMemo, useState } from "react";
import { Search } from "lucide-react";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const generatedId = useId();
  if (isValidElement<{ id?: string }>(children) && (typeof children.type !== "string" || ["input", "select", "textarea"].includes(children.type))) {
    const id = children.props.id ?? generatedId;
    return <div className="field"><label htmlFor={id}>{label}</label>{cloneElement(children, { id })}{hint ? <small>{hint}</small> : null}</div>;
  }
  return <label className="field"><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

type OptionElement = ReactElement<{ value?: string | number; children?: ReactNode }>;

function optionText(value: ReactNode): string {
  return Children.toArray(value).map((item) => typeof item === "string" || typeof item === "number" ? String(item) : "").join(" ");
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { searchable?: boolean };

export function Select({ children, className, onChange, value, defaultValue, searchable = true, ...props }: SelectProps) {
  const options = useMemo(() => Children.toArray(children).filter((child): child is OptionElement => isValidElement(child) && child.type === "option"), [children]);
  const [query, setQuery] = useState("");
  const [internalValue, setInternalValue] = useState(() => String(defaultValue ?? ""));

  const selectedValue = String(value ?? internalValue);
  const normalizedQuery = useDeferredValue(query.trim().toLocaleLowerCase("es"));
  const indexedOptions = useMemo(() => options.map((option) => ({ option, value: String(option.props.value ?? ""), text: optionText(option.props.children).toLocaleLowerCase("es") })), [options]);
  const visibleOptions = useMemo(() => indexedOptions.filter((item) => !normalizedQuery || item.value === "" || item.value === selectedValue || item.text.includes(normalizedQuery)).map((item) => item.option), [indexedOptions, normalizedQuery, selectedValue]);
  if (!searchable || options.length <= 10) return <select className={`input${className ? ` ${className}` : ""}`} value={value} defaultValue={defaultValue} onChange={onChange} {...props}>{children}</select>;
  const searchName = typeof props["aria-label"] === "string" ? props["aria-label"] : typeof props.name === "string" ? props.name : "opciones";

  return <div className="searchable-select">
    <label className="searchable-select__search"><Search size={14} /><input type="search" disabled={props.disabled} value={query} onChange={(event) => setQuery(event.target.value)} aria-label={`Buscar en ${searchName}`} placeholder="Buscar opción…" autoComplete="off" /></label>
    <select className={`input${className ? ` ${className}` : ""}`} value={value} defaultValue={defaultValue} onChange={(event) => { setInternalValue(event.target.value); onChange?.(event); }} {...props}>{visibleOptions}</select>
    <small className="searchable-select__count">{visibleOptions.length} de {options.length} opciones</small>
  </div>;
}

export function DatePicker(props: InputHTMLAttributes<HTMLInputElement>) {
  return <Input type="date" {...props} />;
}

export function Filters({ children }: { children: ReactNode }) {
  return <div className="filters">{children}</div>;
}
