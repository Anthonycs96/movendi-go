"use client";
import { useState } from "react";
import type { MinimarketData } from "@movendi/contracts";
import { Form, Input, s } from "./ui";
import type { RetailOperation } from "./use-operation";
import styles from "./MinimarketWorkspace.module.css";

export function CategoryField({ categories, value = "General" }: { categories: MinimarketData["categories"]; value?: string }) {
  const [selected, setSelected] = useState(value);
  const names = [...new Set([value, ...categories.filter((category) => category.active).map((category) => category.name)])];
  return <><label>Categoría<select name={selected === "__new__" ? undefined : "category"} value={selected} onChange={(event) => setSelected(event.target.value)}>{names.map((name) => <option key={name} value={name}>{name}</option>)}<option value="__new__">+ Nueva categoría</option></select></label>{selected === "__new__" ? <Input name="category" label="Nombre de la nueva categoría" /> : null}</>;
}

export function Categories({ data, op, canWrite }: { data: MinimarketData; op: RetailOperation; canWrite: boolean }) {
  return <div className={styles.catalog}>
    <div className={styles.catalogActions}>{canWrite ? <Form modal={{ title: "Nueva categoría" }} busy={op.busy} label="Crear categoría" submit={(form) => op.run("categories", { name: s(form, "name") })}><Input name="name" label="Nombre de la categoría" /></Form> : null}</div>
    <p className={styles.muted}>Organiza los productos de esta sucursal. Al renombrar una categoría se actualizan todos sus productos.</p>
    <section aria-label="Categorías del catálogo" className={styles.catalogList}>
      {data.categories.map((category) => <article key={category.id} className={`${styles.catalogItem} ${styles.categoryItem}`}>
        <div><h2>{category.name}</h2><p>{category.productCount} {category.productCount === 1 ? "producto" : "productos"}{category.active ? "" : " · Inactiva"}</p></div>
        {canWrite ? <div className={styles.catalogActions}>
          <Form key={`${category.id}:${category.name}`} modal={{ title: `Editar categoría ${category.name}`, trigger: `Editar ${category.name}` }} busy={op.busy} label="Guardar categoría" submit={(form) => op.run(`categories/${category.id}`, { name: s(form, "name") }, "PATCH")}><Input name="name" label="Nombre de la categoría" value={category.name} /></Form>
          {category.productCount === 0 ? <Form modal={{ title: `Eliminar categoría ${category.name}`, trigger: `Eliminar ${category.name}` }} busy={op.busy} label="Confirmar eliminación" submit={() => op.run(`categories/${category.id}`, {}, "DELETE")}><p>Se eliminará la categoría {category.name}. No tiene productos asignados.</p></Form> : <span className={styles.muted}>Reasigna sus productos para eliminarla.</span>}
        </div> : null}
      </article>)}
      {!data.categories.length ? <div className={styles.emptyState}><h2>Organiza tu catálogo</h2><p>{canWrite ? "Crea categorías como Bebidas, Abarrotes o Limpieza antes de registrar tus productos." : "Todavía no hay categorías registradas."}</p></div> : null}
    </section>
  </div>;
}
