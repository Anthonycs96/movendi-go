import type { ChangeEvent, InputHTMLAttributes } from "react";
import { Search, X } from "lucide-react";

export function SearchInput({ value, onChange, onClear, placeholder = "Buscar…", ...props }: InputHTMLAttributes<HTMLInputElement> & { onClear?: () => void }) {
  function clear() {
    if (onClear) return onClear();
    onChange?.({ target: { value: "" }, currentTarget: { value: "" } } as ChangeEvent<HTMLInputElement>);
  }
  return (
    <label className="search-input">
      <Search aria-hidden="true" size={16} />
      <input value={value} onChange={onChange} placeholder={placeholder} {...props} />
      {value ? <button type="button" className="search-input__clear" aria-label="Limpiar búsqueda" onClick={clear}><X aria-hidden="true" size={14} /></button> : <kbd>⌘ K</kbd>}
    </label>
  );
}
