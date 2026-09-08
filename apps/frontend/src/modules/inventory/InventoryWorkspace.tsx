"use client";

import { type FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownToLine,
  Boxes,
  ClipboardCheck,
  History,
  PackagePlus,
  Search,
  ShoppingCart,
  TrendingDown,
  WalletCards,
} from "lucide-react";
import type { InventoryData, InventoryItemDto } from "@movendi/contracts";
import {
  Button,
  Card,
  DataTable,
  Dialog,
  Field,
  Input,
  OperationForm,
  PageHeader,
  Select,
  StatCard,
  StatusBadge,
} from "@/shared/components/ui";
import { formatCurrencyCents, formatDateTime } from "@/shared/lib/format";

type Tab = "stock" | "kardex" | "purchases" | "counts" | "recipes";
type Line = { itemId: string; quantity: string; unitCost?: string };

const kindLabels: Record<string, string> = {
  PRODUCT: "Producto",
  INPUT: "Insumo",
  MATERIAL: "Material",
  SUPPLY: "Suministro",
  PART: "Repuesto",
};
const movementLabels: Record<string, string> = {
  OPENING_BALANCE: "Stock inicial",
  PURCHASE: "Compra",
  RESTOCK: "Reposición",
  RETURN_IN: "Devolución",
  CONSUMPTION: "Consumo",
  SALE_CONSUMPTION: "Venta / receta",
  SALE_RETURN: "Devolución de venta",
  ORDER_RESERVATION: "Reserva de pedido",
  RESERVATION_RELEASE: "Liberación de reserva",
  RELEASED_RESERVATION: "Reserva liberada",
  WASTE: "Merma",
  LOSS: "Pérdida",
  ADJUSTMENT_IN: "Ajuste positivo",
  ADJUSTMENT_OUT: "Ajuste negativo",
  COUNT_ADJUSTMENT: "Conteo físico",
};

async function send(endpoint: string, body: unknown) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(
      payload.error?.message ?? "No pudimos completar la operación.",
    );
  return payload.message ?? "Operación completada.";
}

function ItemFields({ item }: { item?: InventoryItemDto }) {
  return (
    <>
      <Field label="Código / SKU">
        <Input
          name="sku"
          required
          defaultValue={item?.sku}
          placeholder="INS-ARROZ-001"
        />
      </Field>
      <Field label="Nombre">
        <Input
          name="name"
          required
          defaultValue={item?.name}
          placeholder="Arroz extra"
        />
      </Field>
      <Field label="Tipo">
        <Select name="kind" defaultValue={item?.kind ?? "INPUT"}>
          <option value="PRODUCT">Producto</option>
          <option value="INPUT">Insumo</option>
          <option value="MATERIAL">Material</option>
          <option value="SUPPLY">Suministro</option>
          <option value="PART">Repuesto</option>
        </Select>
      </Field>
      <Field label="Unidad de medida" hint="Puedes escribir una unidad propia.">
        <Input name="unit" list="inventory-units" required defaultValue={item?.unit ?? "UND"} />
        <datalist id="inventory-units">
          <option value="UND" /><option value="KG" /><option value="G" /><option value="L" /><option value="ML" /><option value="M" /><option value="CAJA" /><option value="PAQ" /><option value="JGO" /><option value="DOC" />
        </datalist>
      </Field>
      {!item ? (
        <Field label="Stock inicial">
          <Input
            name="openingStock"
            type="number"
            min="0"
            step="0.001"
            defaultValue="0"
          />
        </Field>
      ) : null}
      <Field label="Stock mínimo">
        <Input
          name="minimumStock"
          type="number"
          min="0"
          step="0.001"
          defaultValue={item?.minimumStock ?? 0}
        />
      </Field>
      <Field label="Costo unitario">
        <Input
          name="unitCost"
          type="number"
          min="0"
          step="0.01"
          defaultValue={item ? item.unitCostCents / 100 : 0}
        />
      </Field>
      <Field label="Código de barras">
        <Input name="barcode" defaultValue={item?.barcode ?? ""} />
      </Field>
      <label className="field form-span">
        <span>Notas</span>
        <textarea
          className="input inventory-textarea"
          name="notes"
          defaultValue={item?.notes ?? ""}
        />
      </label>
      <label className="inventory-check form-span">
        <input
          name="trackStock"
          type="checkbox"
          defaultChecked={item?.trackStock ?? true}
        />
        <span>Controlar existencias de este artículo</span>
      </label>
      {item ? (
        <label className="inventory-check form-span">
          <input name="active" type="checkbox" defaultChecked={item.active} />
          <span>Artículo activo</span>
        </label>
      ) : null}
    </>
  );
}

function ItemForm({ item }: { item?: InventoryItemDto }) {
  return (
    <OperationForm
      title={item ? `Editar ${item.name}` : "Nuevo artículo"}
      description="Registra productos, insumos, materiales, suministros o repuestos."
      endpoint={
        item
          ? `/api/operations/inventory/items/${item.id}`
          : "/api/operations/inventory/items"
      }
      method={item ? "PATCH" : "POST"}
      triggerLabel={item ? "Editar" : "Nuevo artículo"}
      transform={(form) => ({
        sku: form.get("sku"),
        name: form.get("name"),
        kind: form.get("kind"),
        unit: form.get("unit"),
        openingStock: form.get("openingStock") ?? undefined,
        minimumStock: form.get("minimumStock"),
        unitCost: form.get("unitCost"),
        barcode: form.get("barcode"),
        notes: form.get("notes"),
        trackStock: form.get("trackStock") === "on",
        active: form.get("active") === "on",
      })}
    >
      <ItemFields item={item} />
    </OperationForm>
  );
}

function MovementForm({ items }: { items: InventoryItemDto[] }) {
  return (
    <OperationForm
      title="Registrar entrada o salida"
      description="Mermas, pérdidas, consumos y ajustes quedan registrados en el Kardex."
      endpoint="/api/operations/inventory/movements"
      triggerLabel="Entrada / salida"
      transform={(form) => ({
        itemId: form.get("itemId"),
        type: form.get("type"),
        quantity: form.get("quantity"),
        unitCost: form.get("unitCost") || undefined,
        reference: form.get("reference"),
        notes: form.get("notes"),
        idempotencyKey: crypto.randomUUID(),
      })}
    >
      <Field label="Artículo">
        <Select name="itemId" required>
          <option value="">Selecciona</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.sku} · {item.name} ({item.stock} {item.unit})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Movimiento">
        <Select name="type" defaultValue="RESTOCK">
          <option value="RESTOCK">Reposición / entrada</option>
          <option value="RETURN_IN">Devolución recibida</option>
          <option value="CONSUMPTION">Consumo interno</option>
          <option value="WASTE">Merma</option>
          <option value="LOSS">Pérdida</option>
          <option value="ADJUSTMENT_IN">Ajuste positivo</option>
          <option value="ADJUSTMENT_OUT">Ajuste negativo</option>
        </Select>
      </Field>
      <Field label="Cantidad">
        <Input
          name="quantity"
          required
          type="number"
          min="0.001"
          step="0.001"
        />
      </Field>
      <Field label="Costo unitario (solo entradas)">
        <Input name="unitCost" type="number" min="0" step="0.01" />
      </Field>
      <Field label="Referencia">
        <Input name="reference" placeholder="Documento u operación" />
      </Field>
      <Field label="Motivo / detalle">
        <Input name="notes" placeholder="Obligatorio para mermas y pérdidas" />
      </Field>
    </OperationForm>
  );
}

function LinesEditor({
  items,
  lines,
  setLines,
  costs = false,
}: {
  items: InventoryItemDto[];
  lines: Line[];
  setLines: (lines: Line[]) => void;
  costs?: boolean;
}) {
  return (
    <div className="inventory-lines form-span">
      {lines.map((line, index) => (
        <div className="inventory-line" key={index}>
          <Select
            aria-label="Artículo"
            value={line.itemId}
            onChange={(event) =>
              setLines(
                lines.map((current, position) =>
                  position === index
                    ? { ...current, itemId: event.target.value }
                    : current,
                ),
              )
            }
          >
            <option value="">Selecciona un artículo</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.sku} · {item.name} · {item.stock} {item.unit}
              </option>
            ))}
          </Select>
          <Input
            aria-label="Cantidad"
            type="number"
            min="0"
            step="0.001"
            placeholder="Cantidad"
            value={line.quantity}
            onChange={(event) =>
              setLines(
                lines.map((current, position) =>
                  position === index
                    ? { ...current, quantity: event.target.value }
                    : current,
                ),
              )
            }
          />
          {costs ? (
            <Input
              aria-label="Costo unitario"
              type="number"
              min="0"
              step="0.01"
              placeholder="Costo unitario"
              value={line.unitCost ?? ""}
              onChange={(event) =>
                setLines(
                  lines.map((current, position) =>
                    position === index
                      ? { ...current, unitCost: event.target.value }
                      : current,
                  ),
                )
              }
            />
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={lines.length === 1}
            onClick={() =>
              setLines(lines.filter((_, position) => position !== index))
            }
          >
            Quitar
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() =>
          setLines([
            ...lines,
            { itemId: "", quantity: "", unitCost: costs ? "" : undefined },
          ])
        }
      >
        Agregar línea
      </Button>
    </div>
  );
}

function PurchaseDialog({ items }: { items: InventoryItemDto[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { itemId: "", quantity: "", unitCost: "" },
  ]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      await send("/api/operations/inventory/purchases", {
        supplierName: form.get("supplierName"),
        documentNumber: form.get("documentNumber"),
        purchasedAt: form.get("purchasedAt") || undefined,
        notes: form.get("notes"),
        idempotencyKey: crypto.randomUUID(),
        lines,
      });
      setOpen(false);
      setLines([{ itemId: "", quantity: "", unitCost: "" }]);
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No pudimos registrar la compra.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <ShoppingCart size={16} />
        Registrar compra
      </Button>
      <Dialog
        open={open}
        title="Nueva compra"
        description="Cada línea aumenta el stock y actualiza el costo promedio."
        onClose={() => !pending && setOpen(false)}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              form="inventory-purchase-form"
              type="submit"
              loading={pending}
            >
              Registrar compra
            </Button>
          </>
        }
      >
        <form
          id="inventory-purchase-form"
          className="form-grid"
          onSubmit={submit}
        >
          <Field label="Proveedor">
            <Input required name="supplierName" />
          </Field>
          <Field label="Documento">
            <Input
              name="documentNumber"
              placeholder="Factura, boleta u orden"
            />
          </Field>
          <Field label="Fecha">
            <Input name="purchasedAt" type="datetime-local" />
          </Field>
          <Field label="Notas">
            <Input name="notes" />
          </Field>
          <LinesEditor items={items} lines={lines} setLines={setLines} costs />
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </Dialog>
    </>
  );
}

function CountDialog({ items, restaurant = false }: { items: InventoryItemDto[]; restaurant?: boolean }) {
  const router = useRouter();
  const requestRef = useRef<{ payload: string; key: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [lines, setLines] = useState<Line[]>([{ itemId: "", quantity: "" }]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const payload = { countedAt: form.get("countedAt") || undefined, notes: form.get("notes"), lines: lines.map((line) => ({ itemId: line.itemId, countedQuantity: line.quantity })) };
      const serialized = JSON.stringify(payload);
      if (requestRef.current?.payload !== serialized) requestRef.current = { payload: serialized, key: crypto.randomUUID() };
      await send("/api/operations/inventory/counts", { ...payload, idempotencyKey: requestRef.current.key });
      requestRef.current = null;
      setOpen(false);
      setLines([{ itemId: "", quantity: "" }]);
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No pudimos aplicar el conteo.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <ClipboardCheck size={16} />
        Conteo físico
      </Button>
      <Dialog
        open={open}
        title="Conteo físico"
        description={restaurant ? "Cuenta las existencias físicas, incluidos los insumos reservados que aún no se prepararon. Excluye lo que ya entró en preparación. El ajuste conserva las reservas pendientes." : "Compara lo contado con el sistema y crea los ajustes necesarios."}
        onClose={() => !pending && setOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button form="inventory-count-form" type="submit" loading={pending}>
              Aplicar conteo
            </Button>
          </>
        }
      >
        <form id="inventory-count-form" className="form-grid" onSubmit={submit}>
          <Field label="Fecha">
            <Input name="countedAt" type="datetime-local" />
          </Field>
          <Field label="Notas">
            <Input name="notes" />
          </Field>
          <LinesEditor items={items} lines={lines} setLines={setLines} />
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </Dialog>
    </>
  );
}

function RecipeDialog({ data }: { data: InventoryData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [productId, setProductId] = useState("");
  const [yieldQuantity, setYieldQuantity] = useState("1");
  const [lines, setLines] = useState<Line[]>([{ itemId: "", quantity: "" }]);
  function selectProduct(id: string) {
    setProductId(id);
    const recipe = data.products.find((product) => product.id === id)?.recipe;
    setYieldQuantity(String(recipe?.yieldQuantity ?? 1));
    setLines(
      recipe?.ingredients.length
        ? recipe.ingredients.map((ingredient) => ({
            itemId: ingredient.itemId,
            quantity: String(ingredient.quantity),
          }))
        : [{ itemId: "", quantity: "" }],
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await send(`/api/operations/inventory/recipes/${productId}`, {
        yieldQuantity,
        active: true,
        ingredients: lines.map((line) => ({
          itemId: line.itemId,
          quantity: line.quantity,
          wastePercent: 0,
        })),
      });
      setOpen(false);
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No pudimos guardar la receta.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PackagePlus size={16} />
        Configurar receta
      </Button>
      <Dialog
        open={open}
        title="Receta o composición"
        description="Las cantidades se descuentan automáticamente al cobrar el producto."
        onClose={() => !pending && setOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              form="inventory-recipe-form"
              type="submit"
              loading={pending}
              disabled={!productId}
            >
              Guardar receta
            </Button>
          </>
        }
      >
        <form
          id="inventory-recipe-form"
          className="form-grid"
          onSubmit={submit}
        >
          <Field label="Producto vendido">
            <Select
              required
              value={productId}
              onChange={(event) => selectProduct(event.target.value)}
            >
              <option value="">Selecciona un producto</option>
              {data.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                  {product.recipe ? " · con receta" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Rendimiento de la receta">
            <Input
              type="number"
              min="0.001"
              step="0.001"
              value={yieldQuantity}
              onChange={(event) => setYieldQuantity(event.target.value)}
            />
          </Field>
          <LinesEditor
            items={data.items.filter((item) => item.active && item.trackStock)}
            lines={lines}
            setLines={setLines}
          />
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </Dialog>
    </>
  );
}

function stockStatus(item: InventoryItemDto) {
  return item.stock <= 0
    ? "Agotado"
    : item.stock <= item.minimumStock
      ? "Stock bajo"
      : "Disponible";
}

function SaleReturnDialog({ data, currency, locale }: { data: InventoryData; currency: string; locale: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const available = data.sales.filter((sale) => sale.hasInventory && !sale.inventoryReturned);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      await send("/api/operations/inventory/returns", { saleId: form.get("saleId"), reason: form.get("reason") });
      setOpen(false);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos devolver el inventario.");
    } finally {
      setPending(false);
    }
  }
  return <>
    <Button variant="secondary" disabled={!available.length} onClick={() => setOpen(true)}>Devolver venta</Button>
    <Dialog open={open} title="Devolver inventario de una venta" description="Repone exactamente los insumos descontados por la receta original." onClose={() => !pending && setOpen(false)} footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" form="inventory-return-form" loading={pending}>Confirmar devolución</Button></>}>
      <form id="inventory-return-form" className="form-grid" onSubmit={submit}>
        <Field label="Venta"><Select name="saleId" required><option value="">Selecciona</option>{available.map((sale) => <option key={sale.id} value={sale.id}>{sale.code} · {formatDateTime(sale.createdAt)} · {formatCurrencyCents(sale.totalCents, currency, locale)}</option>)}</Select></Field>
        <Field label="Motivo"><Input name="reason" required minLength={3} placeholder="Anulación o devolución" /></Field>
        {error ? <p className="form-error">{error}</p> : null}
      </form>
    </Dialog>
  </>;
}

export function InventoryWorkspace({
  data,
  tenantType,
  currency = "PEN",
  locale = "es-PE",
  canWrite = true,
}: {
  data: InventoryData;
  tenantType: string;
  currency?: string;
  locale?: string;
  canWrite?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("stock");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const activeItems = data.items.filter((item) => item.active);
  const filtered = useMemo(
    () =>
      activeItems.filter((item) => {
        const matches =
          !query ||
          `${item.sku} ${item.name} ${item.barcode ?? ""}`
            .toLocaleLowerCase(locale)
            .includes(query.toLocaleLowerCase(locale));
        const status = stockStatus(item);
        return (
          matches &&
          (filter === "ALL" || status === filter || item.kind === filter)
        );
      }),
    [activeItems, filter, locale, query],
  );
  const low = activeItems.filter(
    (item) => item.trackStock && item.stock <= item.minimumStock,
  );
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "stock", label: "Stock disponible" },
    { id: "kardex", label: "Kardex" },
    { id: "purchases", label: "Compras" },
    { id: "counts", label: "Conteos" },
    ...(tenantType === "RESTAURANT"
      ? [{ id: "recipes" as Tab, label: "Recetas" }]
      : []),
  ];
  return (
    <>
      <PageHeader
        eyebrow="CONTROL OPERATIVO"
        title="Inventario"
        description="Controla ingresos, consumos, pérdidas, compras y existencias reales por sede."
        icon={Boxes}
        actions={
          canWrite ? <div className="inventory-actions">
            <MovementForm items={activeItems} />
            <PurchaseDialog items={activeItems} />
            {tenantType === "RESTAURANT" ? <SaleReturnDialog data={data} currency={currency} locale={locale} /> : null}
            <ItemForm />
          </div> : null
        }
      />
      <div className="stats-grid stats-grid--four">
        <StatCard
          label="Artículos activos"
          value={String(data.metrics.activeItems)}
          detail={`${data.metrics.totalStock.toLocaleString(locale)} unidades acumuladas`}
          icon={Boxes}
        />
        <StatCard
          label="Stock bajo"
          value={String(data.metrics.lowStock)}
          detail="Requieren reposición"
          icon={AlertTriangle}
          tone="amber"
        />
        <StatCard
          label="Agotados"
          value={String(data.metrics.outOfStock)}
          detail="Sin disponibilidad"
          icon={TrendingDown}
          tone="violet"
        />
        <StatCard
          label="Valorización"
          value={formatCurrencyCents(
            data.metrics.valuationCents,
            currency,
            locale,
          )}
          detail="Stock × costo promedio"
          icon={WalletCards}
          tone="emerald"
        />
      </div>
      {low.length ? (
        <Card className="inventory-alert">
          <AlertTriangle size={18} />
          <div>
            <strong>{low.length} artículo(s) requieren atención</strong>
            <span>
              {low
                .slice(0, 6)
                .map((item) => `${item.name}: ${item.stock} ${item.unit}`)
                .join(" · ")}
            </span>
          </div>
        </Card>
      ) : null}
      <div className="inventory-tabs">
        {tabs.map((entry) => (
          <Button
            key={entry.id}
            type="button"
            size="sm"
            variant={tab === entry.id ? "primary" : "ghost"}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </Button>
        ))}
        <span />
        {canWrite ? <CountDialog items={activeItems} restaurant={tenantType === "RESTAURANT"} /> : null}
        {canWrite && tenantType === "RESTAURANT" ? <RecipeDialog data={data} /> : null}
      </div>
      {tab === "stock" ? (
        <Card className="table-card">
          <div className="inventory-toolbar">
            <label>
              <Search size={15} />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre, SKU o código"
              />
            </label>
            <Select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="ALL">Todos</option>
              <option value="Agotado">Agotados</option>
              <option value="Stock bajo">Stock bajo</option>
              <option value="INPUT">Insumos</option>
              <option value="PRODUCT">Productos</option>
              <option value="MATERIAL">Materiales</option>
              <option value="SUPPLY">Suministros</option>
              <option value="PART">Repuestos</option>
            </Select>
          </div>
          <DataTable
            rows={filtered}
            rowKey={(item) => item.id}
            pageSize={15}
            columns={[
              {
                key: "name",
                header: "Artículo",
                cell: (item) => (
                  <span className="table-primary">
                    <strong>{item.name}</strong>
                    <span>
                      {item.sku} · {kindLabels[item.kind] ?? item.kind}
                    </span>
                  </span>
                ),
              },
              {
                key: "stock",
                header: "Stock",
                align: "right",
                cell: (item) => (
                  <strong>
                    {item.stock.toLocaleString(locale)} {item.unit}
                  </strong>
                ),
              },
              {
                key: "minimumStock",
                header: "Mínimo",
                align: "right",
                cell: (item) =>
                  `${item.minimumStock.toLocaleString(locale)} ${item.unit}`,
              },
              {
                key: "unitCostCents",
                header: "Costo",
                align: "right",
                cell: (item) =>
                  formatCurrencyCents(item.unitCostCents, currency, locale),
              },
              {
                key: "status",
                header: "Estado",
                cell: (item) => (
                  <StatusBadge tone={item.stock <= 0 ? "danger" : item.stock <= item.minimumStock ? "warning" : "success"}>
                    {stockStatus(item)}
                  </StatusBadge>
                ),
              },
              {
                key: "actions",
                header: "",
                sortable: false,
                cell: (item) => canWrite ? <ItemForm item={item} /> : null,
              },
            ]}
          />
        </Card>
      ) : null}
      {tab === "kardex" ? (
        <Card className="table-card">
          <DataTable
            rows={data.movements}
            rowKey={(movement) => movement.id}
            pageSize={20}
            columns={[
              {
                key: "occurredAt",
                header: "Fecha",
                cell: (movement) => formatDateTime(movement.occurredAt),
              },
              {
                key: "item",
                header: "Artículo",
                cell: (movement) => (
                  <span className="table-primary">
                    <strong>{movement.item.name}</strong>
                    <span>{movement.item.sku}</span>
                  </span>
                ),
              },
              {
                key: "type",
                header: "Movimiento",
                cell: (movement) =>
                  movementLabels[movement.type] ?? movement.type,
              },
              {
                key: "quantity",
                header: "Cantidad",
                align: "right",
                cell: (movement) => (
                  <strong
                    className={
                      movement.direction === "IN"
                        ? "inventory-in"
                        : "inventory-out"
                    }
                  >
                    {movement.direction === "IN" ? "+" : "−"}
                    {movement.quantity} {movement.item.unit}
                  </strong>
                ),
              },
              {
                key: "stockAfter",
                header: "Stock",
                align: "right",
                cell: (movement) =>
                  `${movement.stockBefore} → ${movement.stockAfter}`,
              },
              {
                key: "originType",
                header: "Origen",
                cell: (movement) => movement.reference || movement.originType,
              },
              {
                key: "actor",
                header: "Usuario",
                cell: (movement) => movement.actor?.name ?? "Sistema",
              },
            ]}
          />
        </Card>
      ) : null}
      {tab === "purchases" ? (
        <Card className="table-card">
          <DataTable
            rows={data.purchases}
            rowKey={(purchase) => purchase.id}
            columns={[
              {
                key: "purchasedAt",
                header: "Fecha",
                cell: (purchase) => formatDateTime(purchase.purchasedAt),
              },
              {
                key: "code",
                header: "Compra",
                cell: (purchase) => (
                  <span className="table-primary">
                    <strong>{purchase.code}</strong>
                    <span>{purchase.documentNumber || "Sin documento"}</span>
                  </span>
                ),
              },
              {
                key: "supplierName",
                header: "Proveedor",
                cell: (purchase) => purchase.supplierName,
              },
              {
                key: "lines",
                header: "Artículos",
                align: "right",
                cell: (purchase) => String(purchase.lines.length),
              },
              {
                key: "totalCents",
                header: "Total",
                align: "right",
                cell: (purchase) =>
                  formatCurrencyCents(purchase.totalCents, currency, locale),
              },
              {
                key: "createdBy",
                header: "Registró",
                cell: (purchase) => purchase.createdBy.name,
              },
            ]}
          />
        </Card>
      ) : null}
      {tab === "counts" ? (
        <Card className="table-card">
          <DataTable
            rows={data.counts}
            rowKey={(count) => count.id}
            columns={[
              {
                key: "countedAt",
                header: "Fecha",
                cell: (count) => formatDateTime(count.countedAt),
              },
              { key: "code", header: "Conteo", cell: (count) => count.code },
              {
                key: "lines",
                header: "Artículos",
                align: "right",
                cell: (count) => String(count.lines.length),
              },
              {
                key: "differences",
                header: "Con diferencia",
                align: "right",
                cell: (count) =>
                  String(
                    count.lines.filter(
                      (line) => Math.abs(line.difference) > 0.000001,
                    ).length,
                  ),
              },
              {
                key: "createdBy",
                header: "Responsable",
                cell: (count) => count.createdBy.name,
              },
              {
                key: "status",
                header: "Estado",
                cell: (count) => <StatusBadge tone="success">{count.status === "POSTED" ? "Aplicado" : count.status}</StatusBadge>,
              },
            ]}
          />
        </Card>
      ) : null}
      {tab === "recipes" ? (
        <Card className="table-card">
          <DataTable
            rows={data.products}
            rowKey={(product) => product.id}
            columns={[
              {
                key: "name",
                header: "Producto vendido",
                cell: (product) => <strong>{product.name}</strong>,
              },
              {
                key: "recipe",
                header: "Receta",
                cell: (product) =>
                  product.recipe
                    ? `${product.recipe.ingredients.length} insumo(s)`
                    : "Sin configurar",
              },
              {
                key: "yield",
                header: "Rendimiento",
                align: "right",
                cell: (product) => product.recipe?.yieldQuantity ?? "—",
              },
              {
                key: "ingredients",
                header: "Composición",
                cell: (product) =>
                  product.recipe?.ingredients
                    .map(
                      (ingredient) =>
                        `${ingredient.quantity} ${ingredient.item.unit} ${ingredient.item.name}`,
                    )
                    .join(" · ") || "No descuenta inventario",
              },
              {
                key: "status",
                header: "Estado",
                cell: (product) => (
                  <StatusBadge tone={product.recipe?.active ? "success" : "warning"}>
                    {product.recipe?.active ? "Activa" : "Pendiente"}
                  </StatusBadge>
                ),
              },
            ]}
          />
        </Card>
      ) : null}
      <div className="inventory-insights">
        <Card>
          <h3>
            <ArrowDownToLine size={17} /> Mayor consumo
          </h3>
          {data.topConsumption.length ? (
            data.topConsumption.map((entry) => (
              <div key={entry.itemId}>
                <span>{entry.item.name}</span>
                <strong>
                  {entry.quantity.toLocaleString(locale)} {entry.item.unit}
                </strong>
              </div>
            ))
          ) : (
            <p>Aún no hay consumos registrados.</p>
          )}
        </Card>
        <Card>
          <h3>
            <History size={17} /> Trazabilidad real
          </h3>
          <p>
            Cada movimiento conserva stock anterior y posterior, usuario, fecha,
            origen y referencia. Los cobros con receta, compras, devoluciones y
            conteos usan transacciones seguras.
          </p>
        </Card>
      </div>
    </>
  );
}
