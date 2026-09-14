"use client";
import { requestKey } from "@/shared/lib/request-key";
import { hasPermission } from "@/core/auth/permissions";

import Link from "next/link";
import Image from "next/image";
import {
  FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  ChefHat,
  Clock3,
  Download,
  Minus,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  SlidersHorizontal,
  ShoppingBasket,
  Trash2,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import QRCode from "qrcode";
import type { IScannerControls } from "@zxing/browser";
import { useRouter } from "next/navigation";
import { useRestaurantLive } from "./use-restaurant-live";
import type {
  RestaurantData,
  RestaurantOrderDto,
  RestaurantProductDto,
  RestaurantTableDto,
} from "../types";
import {
  Button,
  Card,
  Dialog,
  Field,
  Input,
  OperationButton,
  OperationForm,
  PageHeader,
  Select,
  StatusBadge,
} from "@/shared/components/ui";
import { formatCurrencyCents, formatDateTime } from "@/shared/lib/format";
import { localizeCode } from "@/shared/lib/localization";
import { openQrCamera } from "../lib/qr-camera";
import { StaffActivity } from "./StaffActivity";

const tableLabels: Record<string, string> = {
  AVAILABLE: "Disponible",
  RESERVED: "Reservada",
  IN_SERVICE: "En atención",
  CLEANING: "Limpieza",
};
const orderLabels: Record<string, string> = {
  PLACED: "Enviado",
  QUEUED: "En cola",
  PREPARING: "Preparando",
  READY: "Listo",
  SERVED: "Servido",
};
const kitchenLabels: Record<string, string> = {
  QUEUED: "En cola",
  PREPARING: "Preparando",
  READY: "Listo",
  SERVED: "Entregado",
};
const paymentMethodLabels: Record<string, string> = { CASH: "Efectivo", CARD: "Tarjeta", TRANSFER: "Transferencia", YAPE: "Yape", PLIN: "Plin", OTHER: "Otro" };

type Customer = RestaurantData["customers"][number];

function promotionPreview(
  data: RestaurantData,
  selected: RestaurantProductDto[],
  quantities: Record<string, number>,
  code: string,
) {
  const now = new Date();
  const subtotal = selected.reduce(
    (sum, product) => sum + product.priceCents * quantities[product.id],
    0,
  );
  const normalizedCode = code.trim().toUpperCase();
  const candidates = data.promotions
    .filter((promotion) => {
      if (
        !promotion.active ||
        (normalizedCode
          ? promotion.code !== normalizedCode
          : !promotion.automatic)
      )
        return false;
      if (promotion.startsAt && now < new Date(promotion.startsAt))
        return false;
      if (promotion.endsAt && now > new Date(promotion.endsAt)) return false;
      if (!promotion.weekdays.split(",").includes(String(now.getDay())))
        return false;
      const time = now.toTimeString().slice(0, 5);
      return (
        (!promotion.startTime || time >= promotion.startTime) &&
        (!promotion.endTime || time <= promotion.endTime) &&
        subtotal >= promotion.minSubtotalCents
      );
    })
    .map((promotion) => {
      const eligibleProducts = selected.filter(
        (product) =>
          promotion.scope === "ORDER" ||
          (promotion.scope === "CATEGORY" &&
            promotion.categoryId === product.category.id) ||
          (promotion.scope === "PRODUCT" && promotion.productId === product.id),
      );
      const eligible = eligibleProducts.reduce(
        (sum, product) => sum + product.priceCents * quantities[product.id],
        0,
      );
      let discount = 0;
      if (promotion.kind === "PERCENT")
        discount = Math.round((eligible * promotion.value) / 100);
      else if (promotion.kind === "FIXED")
        discount = Math.min(promotion.value, eligible);
      else {
        const eligibleQuantity = eligibleProducts.reduce(
          (sum, product) => sum + quantities[product.id],
          0,
        );
        let freeUnits =
          Math.floor(eligibleQuantity / promotion.buyQuantity) *
          promotion.freeQuantity;
        for (const product of [...eligibleProducts].sort(
          (a, b) => a.priceCents - b.priceCents,
        )) {
          const units = Math.min(freeUnits, quantities[product.id]);
          discount += units * product.priceCents;
          freeUnits -= units;
          if (freeUnits === 0) break;
        }
      }
      if (promotion.maxDiscountCents !== null)
        discount = Math.min(discount, promotion.maxDiscountCents);
      return { promotion, discount: Math.max(0, Math.min(discount, subtotal)) };
    })
    .filter((item) => item.discount > 0)
    .sort((a, b) => b.discount - a.discount);
  return candidates[0] ?? null;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

function elapsedLabel(createdAt: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000),
  );
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function urgency(createdAt: string, warningMinutes: number, criticalMinutes: number): "danger" | "warning" | "info" {
  const minutes = (Date.now() - new Date(createdAt).getTime()) / 60_000;
  return minutes >= criticalMinutes ? "danger" : minutes >= warningMinutes ? "warning" : "info";
}

function QuantityStepper({
  product,
  quantity,
  onQuantity,
  compact = false,
}: {
  product: RestaurantProductDto;
  quantity: number;
  onQuantity: (id: string, delta: number) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`quantity-stepper quantity-stepper--touch${compact ? " quantity-stepper--compact" : ""}`}
    >
      <button
        type="button"
        aria-label={`Reducir ${product.name}`}
        disabled={quantity === 0}
        onClick={() => onQuantity(product.id, -1)}
      >
        <Minus size={17} />
      </button>
      <b aria-label={`${quantity} unidades`}>{quantity}</b>
      <button
        type="button"
        aria-label={`Agregar ${product.name}`}
        disabled={quantity >= 50}
        onClick={() => onQuantity(product.id, 1)}
      >
        <Plus size={17} />
      </button>
    </div>
  );
}

function NewCustomerDialog({
  open,
  onClose,
  onCreated,
  configuration,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
  configuration: RestaurantData["configuration"];
}) {
  const formId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/operations/restaurant/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as {
        id?: string;
        error?: { message?: string };
      };
      if (!response.ok || !result.id)
        throw new Error(
          result.error?.message ?? "No pudimos registrar al cliente.",
        );
      onCreated({
        id: result.id,
        name: String(body.name),
        dni: String(body.dni || "") || null,
        documentType: String(body.documentType || "") || null,
        segment: String(body.segment || "") || null,
        loyaltyPoints: 0,
        phone: String(body.phone || "") || null,
        email: String(body.email || "") || null,
        notes: null,
        active: true,
      });
      form.reset();
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No pudimos registrar al cliente.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      title="Nuevo cliente"
      description="Se registrará y quedará seleccionado en este pedido."
      onClose={() => {
        if (!pending) onClose();
      }}
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button type="submit" form={formId} loading={pending}>
            Registrar y seleccionar
          </Button>
        </>
      }
    >
      <form id={formId} className="form-grid" onSubmit={submit}>
        <Field label="Nombre completo">
          <Input name="name" required minLength={2} autoFocus />
        </Field>
        <Field label="Tipo de documento"><Select name="documentType" defaultValue={configuration.customers.documentTypes.find((item) => item.active)?.key}>{configuration.customers.documentTypes.filter((item) => item.active).map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</Select></Field>
        <Field label="Documento"><Input name="dni" maxLength={20} required={configuration.customers.requireDocument} /></Field>
        <Field label="Segmento"><Select name="segment" defaultValue={configuration.customers.segments.find((item) => item.active)?.key}>{configuration.customers.segments.filter((item) => item.active).map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</Select></Field>
        <Field label="Celular">
          <Input name="phone" inputMode="tel" />
        </Field>
        <Field label="Correo">
          <Input name="email" type="email" />
        </Field>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

function CustomerPicker({
  customers,
  value,
  onChange,
  onNew,
}: {
  customers: Customer[];
  value: string;
  onChange: (id: string) => void;
  onNew?: () => void;
}) {
  const [query, setQuery] = useState("");
  const normalized = normalize(query);
  const visible = customers.filter(
    (customer) =>
      customer.active &&
      (!normalized ||
        normalize(`${customer.name} ${customer.dni ?? ""}`).includes(
          normalized,
        ) ||
        customer.id === value),
  );
  return (
    <div className="customer-picker">
      <label className="order-search">
        <Search size={15} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar cliente por nombre o DNI"
          aria-label="Buscar cliente por nombre o DNI"
        />
      </label>
      <div className="customer-picker__select">
        <select
          className="input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label="Cliente (opcional)"
        >
          <option value="">Venta sin cliente</option>
          {visible.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
              {customer.dni ? ` · DNI ${customer.dni}` : ""}
            </option>
          ))}
        </select>
        {onNew ? <Button type="button" variant="secondary" onClick={onNew}>
          <UserPlus size={16} />
          Nuevo cliente
        </Button> : null}
      </div>
      {normalized && visible.length === 0 ? (
        <small className="order-empty-inline">
          {onNew ? "No encontramos clientes. Puedes registrarlo ahora." : "No encontramos clientes. Revisa la búsqueda o solicita su registro al administrador."}
        </small>
      ) : null}
    </div>
  );
}

function useMobileOrderMode() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 960px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return mobile;
}

function CurrentOrderCart({
  headingId,
  modal = false,
  formId,
  selected,
  quantities,
  notes,
  addonParents,
  baseProducts,
  generalNote,
  promotionCode = "",
  promotionName,
  unitCount,
  subtotal,
  discount,
  deliveryFee = 0,
  total,
  message,
  failed,
  pending,
  tableId,
  blocked,
  onQuantity,
  onRemove,
  onNote,
  onAddonParent,
  onGeneralNote,
  onPromotionCode = () => undefined,
  kicker = "Pedido actual",
  submitLabel = "Enviar a cocina",
  showGeneralNote = true,
}: {
  headingId: string;
  modal?: boolean;
  formId: string;
  selected: RestaurantProductDto[];
  quantities: Record<string, number>;
  notes: Record<string, string>;
  addonParents: Record<string, string>;
  baseProducts: RestaurantProductDto[];
  generalNote: string;
  promotionCode?: string;
  promotionName?: string | null;
  unitCount: number;
  subtotal: number;
  discount: number;
  deliveryFee?: number;
  total: number;
  message: string;
  failed: boolean;
  pending: boolean;
  tableId: string;
  blocked: boolean;
  onQuantity: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  onNote: (id: string, value: string) => void;
  onAddonParent: (addonId: string, productId: string) => void;
  onGeneralNote: (value: string) => void;
  onPromotionCode?: (value: string) => void;
  kicker?: string;
  submitLabel?: string;
  showGeneralNote?: boolean;
}) {
  return (
    <aside
      className={`current-order ${modal ? "current-order--modal" : "current-order--desktop"}`}
      aria-labelledby={headingId}
    >
      <div className="current-order__scroll">
        <div className="order-section-heading">
          <div>
            <span className="section-kicker">{kicker}</span>
            <h3 id={headingId}>
              {unitCount
                ? `${unitCount} ${unitCount === 1 ? "producto" : "productos"}`
                : "Aún está vacío"}
            </h3>
          </div>
          <ShoppingBasket size={20} />
        </div>
        <div className="current-order__items">
          {selected.map((product) => {
            const quantity = quantities[product.id];
            return (
              <article className="order-line" key={product.id}>
                <div className="order-line__heading">
                  <div>
                    <strong>{product.name}</strong>
                    <small>
                      {quantity} × {formatCurrencyCents(product.priceCents)}
                    </small>
                  </div>
                  <b>{formatCurrencyCents(product.priceCents * quantity)}</b>
                </div>
                <div className="order-line__actions">
                  <QuantityStepper
                    product={product}
                    quantity={quantity}
                    onQuantity={onQuantity}
                    compact
                  />
                  <button
                    type="button"
                    className="remove-order-line"
                    aria-label={`Eliminar ${product.name}`}
                    onClick={() => onRemove(product.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {product.productType === "ADDON" && product.areaAssignmentMode === "INHERIT_FROM_PRODUCT" ? (
                  <label>
                    <span>Producto base para heredar preparación</span>
                    <select className="input" value={addonParents[product.id] ?? (baseProducts.length === 1 ? baseProducts[0].id : "")} onChange={(event) => onAddonParent(product.id, event.target.value)} required>
                      <option value="" disabled>{baseProducts.length ? "Selecciona producto base" : "Agrega primero un producto principal"}</option>
                      {baseProducts.map((base) => <option value={base.id} key={base.id}>{base.name}</option>)}
                    </select>
                  </label>
                ) : null}
                <label>
                  <span>Observación</span>
                  <input
                    className="input"
                    value={notes[product.id] ?? ""}
                    onChange={(event) => onNote(product.id, event.target.value)}
                    maxLength={300}
                    placeholder="Ej. sin cebolla, término medio"
                  />
                </label>
              </article>
            );
          })}
          {selected.length === 0 ? (
            <div className="order-empty order-empty--cart">
              <ShoppingBasket size={26} />
              <strong>Agrega productos de la carta</strong>
              <span>Aparecerán aquí con su cantidad y observaciones.</span>
            </div>
          ) : null}
        </div>
        {showGeneralNote ? (
          <>
            <label className="general-order-note">
              <span>Observación general</span>
              <textarea
                className="input"
                value={generalNote}
                onChange={(event) => onGeneralNote(event.target.value)}
                maxLength={500}
                placeholder="Ej. servir todos los platos juntos"
              />
            </label>
            <label className="promotion-code-field">
              <span>Código promocional</span>
              <input
                className="input"
                value={promotionCode}
                onChange={(event) =>
                  onPromotionCode(event.target.value.toUpperCase())
                }
                maxLength={40}
                placeholder="Opcional"
              />
              {promotionName ? (
                <small>Se aplicará: {promotionName}</small>
              ) : promotionCode ? (
                <small>El código será validado al enviar el pedido.</small>
              ) : (
                <small>Las promociones automáticas se calculan solas.</small>
              )}
            </label>
          </>
        ) : null}
        <div className="order-summary">
          <div>
            <span>Cantidad total</span>
            <strong>{unitCount}</strong>
          </div>
          <div>
            <span>Subtotal</span>
            <strong>{formatCurrencyCents(subtotal)}</strong>
          </div>
          <div>
            <span>Descuento</span>
            <strong>{formatCurrencyCents(discount)}</strong>
          </div>
          {deliveryFee ? (
            <div>
              <span>Envío</span>
              <strong>{formatCurrencyCents(deliveryFee)}</strong>
            </div>
          ) : null}
          <div className="order-summary__total">
            <span>Total</span>
            <strong>{formatCurrencyCents(total)}</strong>
          </div>
        </div>
        {message ? (
          <p className="composer-message" role={failed ? "alert" : "status"}>
            {failed ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            {message}
          </p>
        ) : null}
      </div>
      <Button
        className="send-kitchen-button"
        form={formId}
        type="submit"
        loading={pending}
        size="lg"
        disabled={!selected.length || !tableId || blocked}
      >
        <ChefHat size={18} />
        {submitLabel} · {unitCount} {unitCount === 1 ? "producto" : "productos"}{" "}
        · {formatCurrencyCents(total)}
      </Button>
    </aside>
  );
}

function ActiveOrderExpansionPanel({
  order,
  products,
  onClose,
  onAdded,
}: {
  order: RestaurantOrderDto;
  products: RestaurantProductDto[];
  onClose: () => void;
  onAdded: (message: string) => void;
}) {
  const formId = useId();
  const mobileOrderMode = useMobileOrderMode();
  const [productQuery, setProductQuery] = useState("");
  const [categoryId, setCategoryId] = useState("ALL");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [addonParents, setAddonParents] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [mobileView, setMobileView] = useState<"menu" | "review">("menu");
  const categories = useMemo(() => {
    const map = new Map<string, string>();
    products
      .filter((product) => product.active)
      .forEach((product) =>
        map.set(product.category.id, product.category.name),
      );
    return [...map]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [products]);
  const visibleProducts = useMemo(() => {
    const query = normalize(productQuery);
    return products.filter(
      (product) =>
        product.active &&
        (categoryId === "ALL" || product.category.id === categoryId) &&
        (!query || normalize(product.name).includes(query)),
    );
  }, [categoryId, productQuery, products]);
  const selected = useMemo(
    () =>
      products.filter(
        (product) => product.active && (quantities[product.id] ?? 0) > 0,
      ),
    [products, quantities],
  );
  const baseProducts = useMemo(() => {
    const ids = new Set([
      ...order.items.filter((item) => item.productType !== "ADDON").map((item) => item.productId),
      ...selected.filter((product) => product.productType !== "ADDON").map((product) => product.id),
    ]);
    return products.filter((product) => ids.has(product.id));
  }, [order.items, products, selected]);
  const unitCount = selected.reduce(
    (sum, product) => sum + quantities[product.id],
    0,
  );
  const total = selected.reduce(
    (sum, product) => sum + product.priceCents * quantities[product.id],
    0,
  );
  const adjust = (id: string, delta: number) =>
    setQuantities((value) => ({
      ...value,
      [id]: Math.min(50, Math.max(0, (value[id] ?? 0) + delta)),
    }));
  const remove = (id: string) => {
    setQuantities((value) => {
      const next = { ...value };
      delete next[id];
      return next;
    });
    setNotes((value) => {
      const next = { ...value };
      delete next[id];
      return next;
    });
    setAddonParents((value) => {
      const next = { ...value };
      delete next[id];
      return next;
    });
  };

  const additionRequest = useRef<{ payload: string; key: string } | null>(null);
  const additionSubmitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (additionSubmitting.current || !selected.length) return;
    const unresolvedAddon = selected.find((product) => product.productType === "ADDON" && product.areaAssignmentMode === "INHERIT_FROM_PRODUCT" && !(addonParents[product.id] || baseProducts.length === 1));
    if (unresolvedAddon) { setFailed(true); setMessage(`Selecciona el producto base de ${unresolvedAddon.name}.`); return; }
    additionSubmitting.current = true;
    setPending(true);
    setFailed(false);
    setMessage("");
    try {
      const items = selected.map((product) => ({
        productId: product.id,
        parentProductId: product.productType === "ADDON" && product.areaAssignmentMode === "INHERIT_FROM_PRODUCT" ? addonParents[product.id] || baseProducts[0]?.id : undefined,
        quantity: quantities[product.id],
        notes: notes[product.id]?.trim() || undefined,
      }));
      const serialized = JSON.stringify(items);
      if (additionRequest.current?.payload !== serialized) additionRequest.current = { payload: serialized, key: requestKey() };
      const response = await fetch(
        `/api/operations/restaurant/orders/${order.id}/items`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items, idempotencyKey: additionRequest.current.key }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          result.error?.message ?? "No pudimos ampliar el pedido.",
        );
      const successMessage =
        result.message ??
        "Productos agregados y nueva comanda enviada a cocina.";
      additionRequest.current = null;
      setQuantities({});
      setNotes({});
      setAddonParents({});
      setMobileView("menu");
      onAdded(successMessage);
      onClose();
    } catch (reason) {
      setFailed(true);
      setMessage(
        reason instanceof Error
          ? reason.message
          : "No pudimos conectar con el servidor.",
      );
    } finally {
      additionSubmitting.current = false;
      setPending(false);
    }
  }

  const cartProps = {
    formId,
    selected,
    quantities,
    notes,
    addonParents,
    baseProducts,
    generalNote: "",
    unitCount,
    subtotal: total,
    discount: 0,
    total,
    message,
    failed,
    pending,
    tableId: order.table?.id ?? order.id,
    blocked: false,
    onQuantity: adjust,
    onRemove: remove,
    onNote: (id: string, value: string) =>
      setNotes((current) => ({ ...current, [id]: value })),
    onAddonParent: (addonId: string, productId: string) => setAddonParents((current) => ({ ...current, [addonId]: productId })),
    onGeneralNote: () => undefined,
    kicker: "Ampliación",
    submitLabel: "Enviar ampliación a cocina",
    showGeneralNote: false,
  };

  return (
    <Card className="panel order-composer active-expansion-panel">
      <div className="panel__header active-expansion-heading">
        <div>
          <span className="section-kicker">Ampliar {order.code}</span>
          <h2>Agregar a {order.table?.name ?? "pedido"}</h2>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={onClose}
        >
          <ArrowLeft size={17} />
          Volver al pedido
        </Button>
      </div>
      <form id={formId} className="order-expansion-form" onSubmit={submit}>
        {mobileOrderMode ? (
          <nav className="order-mobile-steps" aria-label="Pasos del pedido">
            <button
              type="button"
              className={mobileView === "menu" ? "active" : ""}
              onClick={() => setMobileView("menu")}
            >
              <span>1</span>
              Agregar productos
            </button>
            <button
              type="button"
              className={mobileView === "review" ? "active" : ""}
              onClick={() => setMobileView("review")}
            >
              <span>2</span>
              Revisar ({unitCount})
            </button>
          </nav>
        ) : null}
        <div className={`order-workbench order-workbench--${mobileView}`}>
          <section
            className="menu-catalog"
            aria-labelledby="expansion-menu-title"
          >
            <div className="order-section-heading">
              <div>
                <span className="section-kicker">Carta</span>
                <h3 id="expansion-menu-title">Agregar productos</h3>
              </div>
              <small>{visibleProducts.length} productos</small>
            </div>
            <label className="order-search order-product-search">
              <Search size={16} />
              <input
                type="search"
                value={productQuery}
                onChange={(event) => setProductQuery(event.target.value)}
                placeholder="Buscar producto por nombre…"
                aria-label="Buscar producto"
              />
            </label>
            <div
              className="category-tabs"
              role="tablist"
              aria-label="Categorías de productos"
            >
              <button
                type="button"
                role="tab"
                aria-selected={categoryId === "ALL"}
                className={categoryId === "ALL" ? "active" : ""}
                onClick={() => setCategoryId("ALL")}
              >
                Todos
              </button>
              {categories.map((category) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={categoryId === category.id}
                  className={categoryId === category.id ? "active" : ""}
                  onClick={() => setCategoryId(category.id)}
                  key={category.id}
                >
                  {category.name}
                </button>
              ))}
            </div>
            <div className="touch-menu-grid">
              {visibleProducts.map((product) => {
                const quantity = quantities[product.id] ?? 0;
                return (
                  <article
                    className={
                      quantity
                        ? "touch-product touch-product--selected"
                        : "touch-product"
                    }
                    key={product.id}
                  >
                    <div className="touch-product__copy">
                      <strong>
                        {product.name}
                        {quantity ? (
                          <CheckCircle2
                            className="touch-product__check"
                            size={15}
                            aria-label="Agregado"
                          />
                        ) : null}
                      </strong>
                      <small>{product.category.name}</small>
                      {product.description ? (
                        <p>{product.description}</p>
                      ) : null}
                      <b>{formatCurrencyCents(product.priceCents)}</b>
                    </div>
                    <QuantityStepper
                      product={product}
                      quantity={quantity}
                      onQuantity={adjust}
                    />
                  </article>
                );
              })}
            </div>
            {visibleProducts.length === 0 ? (
              <div className="order-empty">
                <Search size={24} />
                <strong>No encontramos productos</strong>
                <span>Prueba otra categoría o término de búsqueda.</span>
              </div>
            ) : null}
          </section>
          {!mobileOrderMode || mobileView === "review" ? (
            <div className="order-review-pane">
              {mobileOrderMode ? (
                <button
                  type="button"
                  className="order-review-back"
                  onClick={() => setMobileView("menu")}
                >
                  <ArrowLeft size={17} />
                  Seguir agregando productos
                </button>
              ) : null}
              <CurrentOrderCart
                headingId="expansion-order-title"
                modal={mobileOrderMode}
                {...cartProps}
              />
            </div>
          ) : null}
        </div>
        {mobileOrderMode && mobileView === "menu" ? (
          <button
            type="button"
            className="mobile-order-trigger"
            onClick={() => setMobileView("review")}
            aria-label={`Revisar ampliación (${unitCount}) · ${formatCurrencyCents(total)}`}
          >
            <ShoppingBasket size={18} />
            <span>Revisar ampliación ({unitCount})</span>
            <strong>{formatCurrencyCents(total)}</strong>
          </button>
        ) : null}
      </form>
    </Card>
  );
}

function ActiveOrderPanel({
  order,
  products,
  paymentMethods,
  warningMinutes,
  criticalMinutes,
  splitPaymentsEnabled,
  permissions,
}: {
  order: RestaurantOrderDto;
  products: RestaurantProductDto[];
  paymentMethods: string[];
  warningMinutes: number;
  criticalMinutes: number;
  splitPaymentsEnabled: boolean;
  permissions: string[];
}) {
  const router = useRouter();
  const [paymentMethod, setPaymentMethod] = useState(paymentMethods.includes("CARD") ? "CARD" : paymentMethods[0] ?? "CASH");
  const [splitMode, setSplitMode] = useState(false);
  const [payments, setPayments] = useState<Array<{ method: string; amount: string }>>([{ method: paymentMethods[0] ?? "CASH", amount: (order.totalCents / 100).toFixed(2) }]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [expansionOpen, setExpansionOpen] = useState(false);

  async function run(
    endpoint: string,
    method: "POST" | "PATCH",
    body: unknown,
    success: string,
  ) {
    setPending(true);
    setFailed(false);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          result.error?.message ?? "No pudimos completar la operación.",
        );
      setMessage(result.message ?? success);
      router.refresh();
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "No pudimos completar la operación.",
      );
    } finally {
      setPending(false);
    }
  }

  if (expansionOpen) {
    return (
      <ActiveOrderExpansionPanel
        order={order}
        products={products}
        onClose={() => setExpansionOpen(false)}
        onAdded={(success) => {
          setFailed(false);
          setMessage(success);
          setExpansionOpen(false);
          router.refresh();
        }}
      />
    );
  }

  return (
    <Card className="panel order-composer table-attention">
      <div className="panel__header">
        <div>
          <span className="section-kicker">Atención activa</span>
          <h2>{order.code}</h2>
        </div>
        <strong>{formatCurrencyCents(order.totalCents)}</strong>
      </div>
      <div className="attention-meta">
        <span>
          <UserRound size={14} />
          <small>Mozo</small>
          <strong>{order.waiter.name}</strong>
        </span>
        <span>
          <Clock3 size={14} />
          <small>Tiempo</small>
          <strong>{elapsedLabel(order.createdAt)}</strong>
        </span>
        <span>
          <ChefHat size={14} />
          <small>Cocina</small>
          <strong>
            {kitchenLabels[order.kitchenTicket?.status ?? ""] ?? "Sin comanda"}
          </strong>
        </span>
      </div>
      <div className="attention-customer">
        <strong>{order.customer?.name ?? "Venta sin cliente"}</strong>
        <StatusBadge tone={urgency(order.createdAt, warningMinutes, criticalMinutes)}>
          {orderLabels[order.status] ?? order.status}
        </StatusBadge>
      </div>
      {order.notes ? (
        <p className="attention-general-note">
          <b>Nota:</b> {order.notes}
        </p>
      ) : null}
      <ul className="attention-items">
        {order.items.map((item) => (
          <li key={item.id}>
            <span>
              <b>{item.quantity}×</b> {item.name}
              {item.notes ? <small>{item.notes}</small> : null}
            </span>
            <strong>{formatCurrencyCents(item.totalCents)}</strong>
          </li>
        ))}
      </ul>
      {hasPermission(permissions, "restaurant:orders:write") ? <Button
        type="button"
        size="lg"
        className="attention-add-button"
        onClick={() => setExpansionOpen(true)}
      >
        <Plus size={18} />
        Abrir carta y agregar productos
      </Button> : null}
      {hasPermission(permissions, "restaurant:cash:write") ? <div className="attention-checkout">
        {!splitMode ? <Select
          value={paymentMethod}
          onChange={(event) => setPaymentMethod(event.target.value)}
          aria-label="Medio de pago"
        >
          {paymentMethods.map((method) => <option value={method} key={method}>{paymentMethodLabels[method] ?? method}</option>)}
        </Select> : <div className="split-payment-editor">{payments.map((payment, index) => <div key={`${index}-${payment.method}`}><Select aria-label={`Medio de pago ${index + 1}`} value={payment.method} onChange={(event) => setPayments((current) => current.map((item, row) => row === index ? { ...item, method: event.target.value } : item))}>{paymentMethods.map((method) => <option value={method} key={method}>{paymentMethodLabels[method] ?? method}</option>)}</Select><Input aria-label={`Monto ${index + 1}`} type="number" min="0.01" step="0.01" value={payment.amount} onChange={(event) => setPayments((current) => current.map((item, row) => row === index ? { ...item, amount: event.target.value } : item))} />{payments.length > 2 ? <Button type="button" variant="ghost" size="sm" onClick={() => setPayments((current) => current.filter((_, row) => row !== index))}>Quitar</Button> : null}</div>)}<small>Asignado: {formatCurrencyCents(payments.reduce((sum, payment) => sum + Math.round((Number(payment.amount) || 0) * 100), 0))} de {formatCurrencyCents(order.totalCents)}</small><Button type="button" variant="ghost" size="sm" disabled={payments.length >= Math.min(10, paymentMethods.length)} onClick={() => { const assigned = payments.reduce((sum, payment) => sum + Math.round((Number(payment.amount) || 0) * 100), 0); const nextMethod = paymentMethods.find((method) => !payments.some((payment) => payment.method === method)) ?? paymentMethods[0]; setPayments((current) => [...current, { method: nextMethod, amount: (Math.max(0, order.totalCents - assigned) / 100).toFixed(2) }]); }}>Agregar otro medio</Button></div>}
        {splitPaymentsEnabled ? <label className="split-payment-toggle"><input type="checkbox" checked={splitMode} onChange={(event) => { const enabled = event.target.checked; setSplitMode(enabled); if (enabled) { const first = Math.floor(order.totalCents / 2); setPayments([{ method: paymentMethods[0] ?? "CASH", amount: (first / 100).toFixed(2) }, { method: paymentMethods.find((method) => method !== (paymentMethods[0] ?? "CASH")) ?? paymentMethods[0] ?? "CASH", amount: ((order.totalCents - first) / 100).toFixed(2) }]); } }} /> Dividir pago</label> : null}
        <Button
          loading={pending}
          variant="primary"
          disabled={splitMode && payments.reduce((sum, payment) => sum + Math.round((Number(payment.amount) || 0) * 100), 0) !== order.totalCents}
          onClick={() =>
            void run(
              `/api/operations/restaurant/orders/${order.id}/checkout`,
              "POST",
              splitMode ? { payments: payments.map((payment) => ({ method: payment.method, amount: Number(payment.amount) })) } : { paymentMethod },
              "Pedido cobrado.",
            )
          }
        >
          Cobrar {formatCurrencyCents(order.totalCents)}
        </Button>
      </div> : <p className="order-empty-inline">El cobro de este pedido lo realiza caja.</p>}
      <div className="attention-links">
        {hasPermission(permissions, "restaurant:orders:read") ? <Link href="orders">Ver pedidos</Link> : null}
        {hasPermission(permissions, "restaurant:kitchen:read") ? <Link href="kitchen">Abrir cocina</Link> : null}
      </div>
      {message ? (
        <p className="composer-message" role={failed ? "alert" : "status"}>
          {failed ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          {message}
        </p>
      ) : null}
    </Card>
  );
}

type NewOrderDraft = {
  customerId: string;
  deliveryPhone: string; deliveryAddress: string; deliveryReference: string; deliveryFee: number;
  quantities: Record<string, number>; notes: Record<string, string>; addonParents: Record<string, string>;
  generalNote: string; promotionCode: string; addedCustomers: Customer[];
};

function NewOrderComposer({
  data,
  canCreateCustomer,
  tableId,
  initialSource = "DINE_IN",
  onTableChange,
  onFocusTable,
  onCreated,
  initialDraft,
  draftKey,
  onDraftChange,
  onBusy,
  onSourceChange,
}: {
  initialDraft?: NewOrderDraft;
  draftKey: string;
  onDraftChange: (key: string, draft?: NewOrderDraft) => void;
  onBusy: (busy: boolean) => void;
  onSourceChange: (source: "DINE_IN" | "TAKEAWAY" | "DELIVERY") => void;
  data: RestaurantData;
  tableId: string;
  canCreateCustomer: boolean;
  initialSource?: "DINE_IN" | "TAKEAWAY" | "DELIVERY";
  onTableChange: (id: string) => void;
  onFocusTable: (id: string) => void;
  onCreated?: (message: string) => void;
}) {
  const router = useRouter();
  const formId = useId();
  const mobileOrderMode = useMobileOrderMode();
  const selectableTables = data.tables.filter(
    (table) =>
      table.active &&
      (table.status === "AVAILABLE" || Boolean(table.activeOrder)),
  );
  const [addedCustomers, setAddedCustomers] = useState<Customer[]>(initialDraft?.addedCustomers ?? []);
  const [customerId, setCustomerId] = useState(initialDraft?.customerId ?? "");
  const source = initialSource;
  const [deliveryPhone, setDeliveryPhone] = useState(initialDraft?.deliveryPhone ?? "");
  const [deliveryAddress, setDeliveryAddress] = useState(initialDraft?.deliveryAddress ?? "");
  const [deliveryReference, setDeliveryReference] = useState(initialDraft?.deliveryReference ?? "");
  const [deliveryFee, setDeliveryFee] = useState(initialDraft?.deliveryFee ?? 0);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [categoryId, setCategoryId] = useState("ALL");
  const [quantities, setQuantities] = useState<Record<string, number>>(initialDraft?.quantities ?? {});
  const [notes, setNotes] = useState<Record<string, string>>(initialDraft?.notes ?? {});
  const [addonParents, setAddonParents] = useState<Record<string, string>>(initialDraft?.addonParents ?? {});
  const [generalNote, setGeneralNote] = useState(initialDraft?.generalNote ?? "");
  const [promotionCode, setPromotionCode] = useState(initialDraft?.promotionCode ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [mobileView, setMobileView] = useState<"menu" | "review">("menu");
  useEffect(() => {
    onDraftChange(draftKey, { customerId, deliveryPhone, deliveryAddress, deliveryReference, deliveryFee, quantities, notes, addonParents, generalNote, promotionCode, addedCustomers });
  }, [draftKey, onDraftChange, customerId, deliveryPhone, deliveryAddress, deliveryReference, deliveryFee, quantities, notes, addonParents, generalNote, promotionCode, addedCustomers]);
  const customers = useMemo(
    () => [
      ...data.customers,
      ...addedCustomers.filter(
        (added) => !data.customers.some((customer) => customer.id === added.id),
      ),
    ],
    [addedCustomers, data.customers],
  );
  const selectedTable =
    data.tables.find((table) => table.id === tableId) ?? null;
  const categories = useMemo(() => {
    const map = new Map<string, string>();
    data.products
      .filter((product) => product.active)
      .forEach((product) =>
        map.set(product.category.id, product.category.name),
      );
    return [...map]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [data.products]);
  const visibleProducts = useMemo(() => {
    const query = normalize(productQuery);
    return data.products.filter(
      (product) =>
        product.active &&
        (categoryId === "ALL" || product.category.id === categoryId) &&
        (!query || normalize(product.name).includes(query)),
    );
  }, [categoryId, data.products, productQuery]);
  const selected = useMemo(
    () =>
      data.products.filter(
        (product) => product.active && (quantities[product.id] ?? 0) > 0,
      ),
    [data.products, quantities],
  );
  const baseProducts = useMemo(() => selected.filter((product) => product.productType !== "ADDON"), [selected]);
  const unitCount = selected.reduce(
    (sum, product) => sum + quantities[product.id],
    0,
  );
  const subtotal = selected.reduce(
    (sum, product) => sum + product.priceCents * quantities[product.id],
    0,
  );
  const promotion = promotionPreview(data, selected, quantities, promotionCode);
  const discount = promotion?.discount ?? 0;
  const deliveryFeeCents =
    source === "DELIVERY" ? Math.round(deliveryFee * 100) : 0;
  const total = subtotal - discount + deliveryFeeCents;

  function adjust(id: string, delta: number) {
    setQuantities((value) => ({
      ...value,
      [id]: Math.min(50, Math.max(0, (value[id] ?? 0) + delta)),
    }));
  }
  function remove(id: string) {
    setQuantities((value) => {
      const next = { ...value };
      delete next[id];
      return next;
    });
    setNotes((value) => {
      const next = { ...value };
      delete next[id];
      return next;
    });
    setAddonParents((value) => {
      const next = { ...value };
      delete next[id];
      return next;
    });
  }

  const orderRequest = useRef<{ payload: string; key: string } | null>(null);
  const orderSubmitting = useRef(false);

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (orderSubmitting.current) return;
    if (
      source === "DINE_IN" &&
      (!selectedTable ||
        selectedTable.activeOrder ||
        selectedTable.status !== "AVAILABLE")
    ) {
      setFailed(true);
      setMessage(
        "Esta mesa ya no está disponible. Abre su pedido activo o selecciona otra mesa.",
      );
      return;
    }
    if (
      source === "DELIVERY" &&
      (!customerId || !deliveryPhone.trim() || !deliveryAddress.trim())
    ) {
      setFailed(true);
      setMessage(
        "Para delivery selecciona un cliente e ingresa teléfono y dirección.",
      );
      return;
    }
    if (!selected.length) {
      setFailed(true);
      setMessage("Agrega al menos un producto al pedido.");
      return;
    }
    const unresolvedAddon = selected.find((product) => product.productType === "ADDON" && product.areaAssignmentMode === "INHERIT_FROM_PRODUCT" && !(addonParents[product.id] || baseProducts.length === 1));
    if (unresolvedAddon) { setFailed(true); setMessage(`Selecciona el producto base de ${unresolvedAddon.name}.`); return; }
    orderSubmitting.current = true;
    setPending(true);
    onBusy(true);
    setFailed(false);
    setMessage("");
    try {
      const payload = {
          source,
          tableId: source === "DINE_IN" ? tableId : undefined,
          customerId: customerId || undefined,
          deliveryPhone:
            source === "DELIVERY" ? deliveryPhone.trim() : undefined,
          deliveryAddress:
            source === "DELIVERY" ? deliveryAddress.trim() : undefined,
          deliveryReference:
            source === "DELIVERY"
              ? deliveryReference.trim() || undefined
              : undefined,
          deliveryFee: source === "DELIVERY" ? deliveryFee : 0,
          promotionCode: promotionCode.trim() || undefined,
          notes: generalNote.trim() || undefined,
          items: selected.map((product) => ({
            productId: product.id,
            parentProductId: product.productType === "ADDON" && product.areaAssignmentMode === "INHERIT_FROM_PRODUCT" ? addonParents[product.id] || baseProducts[0]?.id : undefined,
            quantity: quantities[product.id],
            notes: notes[product.id]?.trim() || undefined,
          })),
        };
      const serialized = JSON.stringify(payload);
      if (orderRequest.current?.payload !== serialized) orderRequest.current = { payload: serialized, key: requestKey() };
      const response = await fetch("/api/operations/restaurant/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, idempotencyKey: orderRequest.current.key }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error?.message ?? "No pudimos crear el pedido.");
      const successMessage =
        result.message ?? "Pedido guardado y enviado a cocina.";
      orderRequest.current = null;
      onDraftChange(draftKey, undefined);
      setMessage(onCreated ? "" : successMessage);
      setMobileView("menu");
      setQuantities({});
      setNotes({});
      setAddonParents({});
      setGeneralNote("");
      setPromotionCode("");
      setCustomerId("");
      setDeliveryPhone("");
      setDeliveryAddress("");
      setDeliveryReference("");
      setDeliveryFee(0);
      onCreated?.(successMessage);
      onTableChange("");
      router.refresh();
    } catch (reason) {
      setFailed(true);
      setMessage(
        reason instanceof Error
          ? reason.message
          : "No pudimos conectar con el servidor.",
      );
    } finally {
      orderSubmitting.current = false;
      setPending(false);
      onBusy(false);
    }
  }

  const cartProps = {
    formId,
    selected,
    quantities,
    notes,
    addonParents,
    baseProducts,
    generalNote,
    promotionCode,
    promotionName: promotion?.promotion.name ?? null,
    unitCount,
    subtotal,
    discount,
    deliveryFee: deliveryFeeCents,
    total,
    message,
    failed,
    pending,
    tableId: source === "DINE_IN" ? tableId : source,
    blocked: source === "DINE_IN" && Boolean(selectedTable?.activeOrder),
    onQuantity: adjust,
    onRemove: remove,
    onNote: (id: string, value: string) =>
      setNotes((current) => ({ ...current, [id]: value })),
    onAddonParent: (addonId: string, productId: string) => setAddonParents((current) => ({ ...current, [addonId]: productId })),
    onGeneralNote: setGeneralNote,
    onPromotionCode: setPromotionCode,
  };

  return (
    <Card className="panel order-composer new-order-composer">
      <div className="panel__header new-order-heading">
        <div>
          <span className="section-kicker">Nuevo pedido</span>
          <h2>Carta táctil</h2>
        </div>
        {selectedTable ? (
          <div className="selected-table-heading">
            <strong>
              {selectedTable.name} · {selectedTable.area.name}
            </strong>
            <StatusBadge
              tone={selectedTable.activeOrder ? "warning" : "success"}
            >
              {tableLabels[selectedTable.status] ?? selectedTable.status}
            </StatusBadge>
          </div>
        ) : (
          <strong>{formatCurrencyCents(total)}</strong>
        )}
      </div>
      <form id={formId} onSubmit={createOrder}>
        <div className="order-setup">
          <Field label="Modalidad">
            <Select
              value={source}
              disabled={pending}
              onChange={(event) =>
                onSourceChange(event.target.value as typeof source)
              }
            >
              {data.configuration.orders.sources.filter((option) => option.active && ["DINE_IN", "TAKEAWAY", "DELIVERY"].includes(option.key) && (option.key !== "DELIVERY" || data.configuration.delivery.enabled)).map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}
            </Select>
          </Field>
          {source === "DINE_IN" ? (
            <Field label="Mesa">
              <Select
                value={tableId}
                disabled={pending}
                onChange={(event) => onTableChange(event.target.value)}
                required
              >
                <option value="" disabled>
                  Selecciona mesa
                </option>
                {selectableTables.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.name} · {table.area.name} ·{" "}
                    {table.activeOrder
                      ? `${table.activeOrder.code} activo`
                      : (tableLabels[table.status] ?? table.status)}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <CustomerPicker
            customers={customers}
            value={customerId}
            onChange={setCustomerId}
            onNew={canCreateCustomer ? () => setCustomerDialogOpen(true) : undefined}
          />
        </div>
        {source === "DELIVERY" ? (
          <div className="order-setup">
            <Field label="Teléfono">
              <Input
                value={deliveryPhone}
                onChange={(event) => setDeliveryPhone(event.target.value)}
                required
              />
            </Field>
            <Field label="Dirección">
              <Input
                value={deliveryAddress}
                onChange={(event) => setDeliveryAddress(event.target.value)}
                required
                placeholder="Calle, número y distrito"
              />
            </Field>
            <Field label="Referencia">
              <Input
                value={deliveryReference}
                onChange={(event) => setDeliveryReference(event.target.value)}
                placeholder="Ej. puerta azul"
              />
            </Field>
            <Field label="Costo de envío (S/)">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={deliveryFee}
                onChange={(event) =>
                  setDeliveryFee(Number(event.target.value) || 0)
                }
              />
            </Field>
          </div>
        ) : null}
        {source === "DINE_IN" && selectedTable?.activeOrder ? (
          <div className="active-order-warning" role="alert">
            <AlertCircle size={19} />
            <div>
              <strong>
                {selectedTable.name} tiene el pedido{" "}
                {selectedTable.activeOrder.code} activo
              </strong>
              <span>
                Evita duplicar la atención y continúa sobre la cuenta existente.
              </span>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onFocusTable(selectedTable.id)}
            >
              Abrir pedido
            </Button>
          </div>
        ) : null}
        {mobileOrderMode ? (
          <nav className="order-mobile-steps" aria-label="Pasos del pedido">
            <button
              type="button"
              className={mobileView === "menu" ? "active" : ""}
              onClick={() => setMobileView("menu")}
            >
              <span>1</span>
              Agregar productos
            </button>
            <button
              type="button"
              className={mobileView === "review" ? "active" : ""}
              onClick={() => setMobileView("review")}
            >
              <span>2</span>
              Revisar ({unitCount})
            </button>
          </nav>
        ) : null}
        <div className={`order-workbench order-workbench--${mobileView}`}>
          <section
            className="menu-catalog"
            aria-labelledby="menu-catalog-title"
          >
            <div className="order-section-heading">
              <div>
                <span className="section-kicker">Carta</span>
                <h3 id="menu-catalog-title">Productos disponibles</h3>
              </div>
              <small>{visibleProducts.length} productos</small>
            </div>
            <label className="order-search order-product-search">
              <Search size={16} />
              <input
                type="search"
                value={productQuery}
                onChange={(event) => setProductQuery(event.target.value)}
                placeholder="Buscar producto por nombre…"
                aria-label="Buscar producto"
              />
            </label>
            <div
              className="category-tabs"
              role="tablist"
              aria-label="Categorías de productos"
            >
              <button
                type="button"
                role="tab"
                aria-selected={categoryId === "ALL"}
                className={categoryId === "ALL" ? "active" : ""}
                onClick={() => setCategoryId("ALL")}
              >
                Todos
              </button>
              {categories.map((category) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={categoryId === category.id}
                  className={categoryId === category.id ? "active" : ""}
                  onClick={() => setCategoryId(category.id)}
                  key={category.id}
                >
                  {category.name}
                </button>
              ))}
            </div>
            <div className="touch-menu-grid">
              {visibleProducts.map((product) => {
                const quantity = quantities[product.id] ?? 0;
                return (
                  <article
                    className={
                      quantity
                        ? "touch-product touch-product--selected"
                        : "touch-product"
                    }
                    key={product.id}
                  >
                    <div className="touch-product__copy">
                      <strong>
                        {product.name}
                        {quantity ? (
                          <CheckCircle2
                            className="touch-product__check"
                            size={15}
                            aria-label="Agregado"
                          />
                        ) : null}
                      </strong>
                      <small>{product.category.name}</small>
                      {product.description ? (
                        <p>{product.description}</p>
                      ) : null}
                      <b>{formatCurrencyCents(product.priceCents)}</b>
                    </div>
                    <QuantityStepper
                      product={product}
                      quantity={quantity}
                      onQuantity={adjust}
                    />
                  </article>
                );
              })}
            </div>
            {visibleProducts.length === 0 ? (
              <div className="order-empty">
                <Search size={24} />
                <strong>No encontramos productos</strong>
                <span>Prueba otra categoría o término de búsqueda.</span>
              </div>
            ) : null}
          </section>
          {!mobileOrderMode || mobileView === "review" ? (
            <div className="order-review-pane">
              {mobileOrderMode ? (
                <button
                  type="button"
                  className="order-review-back"
                  onClick={() => setMobileView("menu")}
                >
                  <ArrowLeft size={17} />
                  Seguir agregando productos
                </button>
              ) : null}
              <CurrentOrderCart
                headingId="current-order-title"
                modal={mobileOrderMode}
                {...cartProps}
              />
            </div>
          ) : null}
        </div>
        {mobileOrderMode && mobileView === "menu" ? (
          <button
            type="button"
            className="mobile-order-trigger"
            onClick={() => setMobileView("review")}
            aria-label={`Revisar pedido (${unitCount}) · ${formatCurrencyCents(total)}`}
          >
            <ShoppingBasket size={19} />
            <span>Revisar pedido ({unitCount})</span>
            <strong>{formatCurrencyCents(total)}</strong>
          </button>
        ) : null}
      </form>
      <NewCustomerDialog
        open={customerDialogOpen}
        onClose={() => setCustomerDialogOpen(false)}
        configuration={data.configuration}
        onCreated={(customer) => {
          setAddedCustomers((value) => [
            ...value.filter((item) => item.id !== customer.id),
            customer,
          ]);
          setCustomerId(customer.id);
        }}
      />
    </Card>
  );
}

function TableQrButton({
  table,
  businessName,
}: {
  table: RestaurantTableDto;
  businessName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [qrToken, setQrToken] = useState(table.qrToken ?? "");
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState("");
  async function loadQr(renew = false) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/operations/restaurant/tables/${table.id}/qr`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ renew }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error?.message ?? "No pudimos generar el QR.");
      setQrToken(result.qrToken);
      setImageUrl(
        await QRCode.toDataURL(result.qrValue, {
          width: 560,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#111827", light: "#ffffff" },
        }),
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "No pudimos generar el QR.",
      );
    } finally {
      setPending(false);
    }
  }
  function show() {
    setOpen(true);
    void loadQr(false);
  }
  function download() {
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `QR-${table.name.replace(/[^a-z0-9]+/gi, "-")}.png`;
    link.click();
  }
  function print() {
    const popup = window.open("", "_blank", "width=720,height=850");
    if (!popup) {
      setError("El navegador bloqueó la ventana de impresión.");
      return;
    }
    popup.document.write(
      `<!doctype html><html><head><title>QR ${table.name}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:48px;color:#111827}img{width:420px;max-width:90%}h1{font-size:36px;margin:12px}h2{font-size:24px;color:#d97706}p{font-size:18px}.code{letter-spacing:3px;font-family:monospace}@media print{button{display:none}}</style></head><body><h2>${businessName}</h2><h1>${table.name}</h1><p>${table.area.name} · Escanea desde Movendi Go para abrir la atención</p><img src="${imageUrl}" alt="QR de ${table.name}"/><p class="code">${qrToken}</p><button onclick="window.print()">Imprimir</button><script>window.onload=()=>window.print()</script></body></html>`,
    );
    popup.document.close();
  }
  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={show}>
        <QrCode size={15} />
        QR
      </Button>
      <Dialog
        open={open}
        title={`QR de ${table.name}`}
        description="Imprímelo y colócalo en la mesa. Solo funciona para personal autenticado de esta sede."
        onClose={() => setOpen(false)}
      >
        {pending ? (
          <p>Generando QR seguro…</p>
        ) : imageUrl ? (
          <div className="table-qr-card">
            <Image src={imageUrl} alt={`Código QR de ${table.name}`} width={360} height={360} unoptimized />
            <strong>
              {businessName} · {table.name}
            </strong>
            <small>Código manual: {qrToken}</small>
            <div className="header-actions">
              <Button type="button" variant="secondary" onClick={download}>
                <Download size={16} />
                Descargar PNG
              </Button>
              <Button type="button" onClick={print}>
                <Printer size={16} />
                Imprimir
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  if (
                    window.confirm(
                      "¿Renovar el QR? El código impreso anteriormente dejará de funcionar.",
                    )
                  )
                    void loadQr(true);
                }}
              >
                <RefreshCw size={16} />
                Renovar
              </Button>
            </div>
          </div>
        ) : null}
        {error ? (
          <p className="composer-message" role="alert">
            <AlertCircle size={16} />
            {error}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}

function TableQrScanner({
  onResolved,
}: {
  onResolved: (tableId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");
  const [resolving, setResolving] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [activeCameraId, setActiveCameraId] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const handledRef = useRef(false);
  const resolveCode = useCallback(
    async (raw: string) => {
      if (handledRef.current) return;
      const token = raw.trim().replace(/^MOVENDI-TABLE:/i, "");
      if (!/^[A-Za-z0-9_-]{12}$/.test(token)) {
        setError("El código no corresponde a una mesa de Movendi Go.");
        return;
      }
      handledRef.current = true;
      setResolving(true);
      setError("");
      try {
        const response = await fetch(
          `/api/operations/restaurant/tables/${encodeURIComponent(token)}/resolve-qr`,
          { cache: "no-store" },
        );
        const result = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(result.error?.message ?? "No encontramos esta mesa.");
        controlsRef.current?.stop();
        setOpen(false);
        onResolved(result.table.id);
      } catch (reason) {
        handledRef.current = false;
        setError(
          reason instanceof Error
            ? reason.message
            : "No pudimos validar el QR.",
        );
      } finally {
        setResolving(false);
      }
    },
    [onResolved],
  );
  useEffect(() => {
    if (!open || !videoRef.current) return;
    handledRef.current = false;
    let cancelled = false;
    let cameraStream: MediaStream | null = null;
    void import("@zxing/browser")
      .then(async ({ BrowserQRCodeReader }) => {
        if (cancelled || !videoRef.current) return;
        const reader = new BrowserQRCodeReader();
        const stream = await openQrCamera(cameraId || undefined);
        cameraStream = stream;
        if (cancelled || !videoRef.current) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        setActiveCameraId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? "");
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (cancelled) return;
        setCameras(devices.filter((device) => device.kind === "videoinput" && device.deviceId));
        const controls = await reader.decodeFromStream(
          stream,
          videoRef.current,
          (result) => {
            if (!cancelled && result) void resolveCode(result.getText());
          },
        );
        if (cancelled) controls.stop();
        else controlsRef.current = controls;
      })
      .catch(() => {
        cameraStream?.getTracks().forEach((track) => track.stop());
        if (!cancelled)
          setError(
            "No pudimos abrir la cámara trasera. Revisa el permiso o usa el código manual.",
          );
      });
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      cameraStream?.getTracks().forEach((track) => track.stop());
    };
  }, [open, resolveCode, cameraId]);
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          setError("");
          setManual("");
          setOpen(true);
        }}
      >
        <Camera size={17} />
        Escanear mesa
      </Button>
      <Dialog
        open={open}
        title="Escanear QR de mesa"
        description="Apunta la cámara al QR impreso. También puedes escribir el código de 12 caracteres."
        onClose={() => setOpen(false)}
      >
        <div className="qr-scanner">
          <div className="qr-scanner__preview">
            <video ref={videoRef} muted playsInline />
            <div className="qr-scanner__frame" />
          </div>
          {cameras.length > 1 ? <Field label="Cámara"><Select value={cameraId || activeCameraId} disabled={resolving} onChange={(event) => { setError(""); setCameraId(event.target.value); }}>{cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Cámara ${index + 1}`}</option>)}</Select></Field> : null}
          <p>Si la imagen está borrosa, aleja un poco el QR o selecciona otra cámara.</p>
          <div className="customer-picker__select">
            <Input
              value={manual}
              onChange={(event) => setManual(event.target.value)}
              maxLength={26}
              placeholder="Código manual"
              autoCapitalize="none"
            />
            <Button
              type="button"
              loading={resolving}
              onClick={() => void resolveCode(manual)}
            >
              Abrir mesa
            </Button>
          </div>
          {error ? (
            <p className="composer-message" role="alert">
              <AlertCircle size={16} />
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}

function TableActions({ table, canWrite, businessName }: { table: RestaurantTableDto; canWrite: boolean; businessName: string }) {
  return <div className="floor-selected-actions" aria-label={`Acciones de ${table.name}`}>
    <strong>{table.name}<small>{table.area.name}</small></strong>
              <div className="floor-table__actions">
                <TableQrButton table={table} businessName={businessName} />
              </div>
              {canWrite && table.status === "CLEANING" ? (
                <OperationButton
                  endpoint={`/api/operations/restaurant/tables/${table.id}/clean`}
                  method="POST"
                >
                  Marcar limpia
                </OperationButton>
              ) : null}
              {canWrite && table.status === "AVAILABLE" ? (
                <div className="floor-table__actions">
                  <OperationButton
                    endpoint={`/api/operations/restaurant/tables/${table.id}/reserve`}
                    method="POST"
                    variant="secondary"
                  >
                    Reserva rápida
                  </OperationButton>
                  <OperationForm
                    title={`Reservar ${table.name}`}
                    description="Registra los datos de la visita."
                    endpoint={`/api/operations/restaurant/tables/${table.id}/reserve`}
                    triggerLabel="Reservar con datos"
                    submitLabel="Confirmar reserva"
                  >
                    <Field label="Nombre">
                      <Input name="name" required />
                    </Field>
                    <Field label="Teléfono">
                      <Input name="phone" />
                    </Field>
                    <Field label="Fecha y hora">
                      <Input name="reservedAt" type="datetime-local" />
                    </Field>
                    <Field label="Personas">
                      <Input
                        name="partySize"
                        type="number"
                        min="1"
                        max={table.seats}
                      />
                    </Field>
                    <Field label="Observaciones">
                      <Input name="notes" />
                    </Field>
                  </OperationForm>
                </div>
              ) : null}
              {canWrite && table.status === "RESERVED" ? (
                <div className="floor-table__actions">
                  <OperationButton
                    endpoint={`/api/operations/restaurant/tables/${table.id}/seat`}
                    method="POST"
                    variant="primary"
                  >
                    Recibir
                  </OperationButton>
                  <OperationButton
                    endpoint={`/api/operations/restaurant/tables/${table.id}/reserve`}
                    method="POST"
                    variant="ghost"
                  >
                    Liberar
                  </OperationButton>
                </div>
              ) : null}
  </div>;
}

function FloorMap({
  disabled = false,
  canWrite,
  tables,
  focusedId,
  onFocus,
  businessName,
  locale,
}: {
  disabled?: boolean;
  canWrite: boolean;
  tables: RestaurantTableDto[];
  focusedId: string;
  onFocus: (id: string) => void;
  businessName: string;
  locale: string;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [areaFilter, setAreaFilter] = useState("ALL");
  const activeTables = useMemo(
    () => tables.filter((table) => table.active).sort((a, b) => a.name.localeCompare(b.name, locale, { numeric: true, sensitivity: "base" })),
    [tables, locale],
  );
  const areas = useMemo(
    () =>
      [...new Map(activeTables.map((table) => [table.area.id, table.area.name]))]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
    [activeTables],
  );
  const filteredTables = useMemo(() => {
    const term = normalize(query);
    return activeTables.filter((table) => {
      const operationalStatus = table.activeOrder
        ? table.activeOrder.kitchenTicket?.status === "READY"
          ? "READY"
          : "ACTIVE"
        : table.status;
      return (
        (statusFilter === "ALL" || operationalStatus === statusFilter) &&
        (areaFilter === "ALL" || table.area.id === areaFilter) &&
        (!term ||
          normalize(`${table.name} ${table.area.name}`).includes(term))
      );
    });
  }, [activeTables, areaFilter, query, statusFilter]);
  const availableCount = activeTables.filter(
    (table) => table.status === "AVAILABLE" && !table.activeOrder,
  ).length;
  const activeCount = activeTables.filter(
    (table) =>
      table.activeOrder && table.activeOrder.kitchenTicket?.status !== "READY",
  ).length;
  const readyCount = activeTables.filter(
    (table) => table.activeOrder?.kitchenTicket?.status === "READY",
  ).length;
  return (
    <Card className="panel floor-map">
      <div className="panel__header floor-map__title">
        <div>
          <span className="section-kicker">Mapa operativo</span>
          <h2>Mesas</h2>
        </div>
        <small>{filteredTables.length} de {activeTables.length} mesas</small>
      </div>
      <div className="floor-map__tools">
        <label className="order-search floor-table-search">
          <Search size={16} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar mesa o área…"
            aria-label="Buscar mesa o área"
          />
        </label>
        <label className="floor-area-filter">
          <SlidersHorizontal size={15} />
          <Select
            value={areaFilter}
            onChange={(event) => setAreaFilter(event.target.value)}
            aria-label="Filtrar mesas por área"
          >
            <option value="ALL">Todas las áreas</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>{area.name}</option>
            ))}
          </Select>
        </label>
      <Select aria-label="Filtrar mesas por estado" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
        {[
          ["ALL", "Todas", activeTables.length],
          ["AVAILABLE", "Libres", availableCount],
          ["ACTIVE", "En atención", activeCount],
          ["READY", "Listas", readyCount],
          ["RESERVED", "Reservadas", activeTables.filter((table) => table.status === "RESERVED").length],
          ["CLEANING", "Limpieza", activeTables.filter((table) => table.status === "CLEANING").length],
].map(([value, label, count]) => <option key={String(value)} value={String(value)}>{label} ({count})</option>)}
      </Select>
      </div>
      <div className="floor-grid" aria-label="Seleccionar mesa">
        {filteredTables.map((table) => <div key={table.id} className={`floor-table floor-table--${table.status.toLowerCase()} ${table.id === focusedId ? "floor-table--selected" : ""}`}>
          <button type="button" className="floor-table__select" disabled={disabled} aria-pressed={table.id === focusedId} onClick={() => onFocus(table.id)}>
            <strong>{table.name}</strong>
            <TableOperationalStatus table={table} locale={locale} />
            <small>{table.activeOrder?.code ?? table.area.name}</small>
          </button>
        </div>)}
      </div>
      {activeTables.find((table) => table.id === focusedId) ? <fieldset className="floor-selected-toolbar" disabled={disabled}>
        <TableActions key={focusedId} table={activeTables.find((table) => table.id === focusedId)!} canWrite={canWrite} businessName={businessName} />
      </fieldset> : null}
      {filteredTables.length === 0 ? (
        <div className="order-empty floor-map__empty">
          <Search size={24} />
          <strong>No encontramos mesas</strong>
          <span>Cambia el estado, el área o el texto de búsqueda.</span>
        </div>
      ) : null}
    </Card>
  );
}

function TableOperationalStatus({ table, locale }: { table: RestaurantTableDto; locale: string }) {
  const kitchen = table.activeOrder?.kitchenTicket?.status;
  if (kitchen === "PREPARING")
    return (
      <StatusBadge tone="danger" dot>
        En cocina
      </StatusBadge>
    );
  if (kitchen === "READY")
    return (
      <StatusBadge tone="success" dot>
        Listo para servir
      </StatusBadge>
    );
  if (kitchen === "QUEUED" || table.activeOrder)
    return (
      <StatusBadge tone="warning" dot>
        Pedido pendiente
      </StatusBadge>
    );
  if (table.status === "AVAILABLE")
    return (
      <StatusBadge tone="success" dot>
        Libre
      </StatusBadge>
    );
  if (table.status === "RESERVED")
    return (
      <StatusBadge tone="warning" dot>
        Reservada
      </StatusBadge>
    );
  if (table.status === "CLEANING")
    return (
      <StatusBadge tone="violet" dot>
        Limpieza
      </StatusBadge>
    );
  return (
    <StatusBadge tone="info" dot>
      {tableLabels[table.status] ?? localizeCode(table.status, locale)}
    </StatusBadge>
  );
}

export function FloorWorkspace({ data, businessName, locale, permissions }: { data: RestaurantData; businessName: string; locale: string; permissions: string[] }) {
  const [drafts, setDrafts] = useState<Record<string, NewOrderDraft>>({});
  const [orderBusy, setOrderBusy] = useState(false);
  const saveDraft = useCallback((key: string, draft?: NewOrderDraft) => {
    setDrafts((current) => { const next = { ...current }; if (draft) next[key] = draft; else delete next[key]; return next; });
  }, []);
  const available = data.tables.filter(
    (table) => table.active && table.status === "AVAILABLE",
  );
  const defaultTableId =
    available[0]?.id ?? data.tables.find((table) => table.active)?.id ?? "";
  const [focusedId, setFocusedId] = useState(defaultTableId);
  const [orderTableId, setOrderTableId] = useState(available[0]?.id ?? "");
  const [orderSource, setOrderSource] = useState<
    "DINE_IN" | "TAKEAWAY" | "DELIVERY"
  >("DINE_IN");
  const [workspaceView, setWorkspaceView] = useState<
    "tables" | "new" | "active"
  >("tables");
  const draftKey = `${orderSource}:${orderTableId}`;
  const [floorNotice, setFloorNotice] = useState("");
  const [showActivity, setShowActivity] = useState(false);
  const canViewStaff = hasPermission(permissions, "restaurant:staff:read");
  const effectiveFocusedId = data.tables.some(
    (table) => table.id === focusedId && table.active,
  )
    ? focusedId
    : defaultTableId;
  const focused =
    data.tables.find((table) => table.id === effectiveFocusedId) ?? null;
  useRestaurantLive(!showActivity && !orderBusy);
  useEffect(() => {
    if (!floorNotice) return;
    const timer = window.setTimeout(() => setFloorNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [floorNotice]);
  function focusTable(id: string) {
    if (orderBusy) return;
    setShowActivity(false);
    setFocusedId(id);
    const table = data.tables.find((item) => item.id === id);
    if (table?.activeOrder) {
      setWorkspaceView("active");
      return;
    }
    if (table?.status === "AVAILABLE") {
      setOrderSource("DINE_IN");
      setOrderTableId(id);
      setWorkspaceView("new");
    } else { setWorkspaceView("tables"); setOrderTableId(id); }
  }
  function changeOrderTable(id: string) {
    if (id) focusTable(id);
    else setOrderTableId("");
  }
  function changeOrderSource(source: "DINE_IN" | "TAKEAWAY" | "DELIVERY") {
    if (orderBusy) return;
    setOrderSource(source);
    const id = source === "DINE_IN" ? available.find((table) => table.id === focusedId)?.id ?? available[0]?.id ?? "" : "";
    setOrderTableId(id);
    if (id) setFocusedId(id);
    setWorkspaceView("new");
  }
  function openOffPremise(source: "TAKEAWAY" | "DELIVERY") {
    if (orderBusy) return;
    setShowActivity(false);
    setOrderSource(source);
    setOrderTableId("");
    setWorkspaceView("new");
  }
  return (
    <>
      <PageHeader
        eyebrow="Operación"
        title="Salón y pedidos"
        description="Gestiona consumo en mesa, pedidos para llevar y delivery."
        actions={
          <div className="header-actions">
            <TableQrScanner onResolved={focusTable} />
            {hasPermission(permissions, "restaurant:orders:write") && data.configuration.orders.sources.some((source) => source.active && source.key === "TAKEAWAY") ? <Button
              type="button"
              variant="secondary"
              disabled={orderBusy}
              onClick={() => openOffPremise("TAKEAWAY")}
            >
              Para llevar
            </Button> : null}
            {hasPermission(permissions, "restaurant:orders:write") && data.configuration.delivery.enabled && data.configuration.orders.sources.some((source) => source.active && source.key === "DELIVERY") ? <Button
              type="button"
              variant="primary"
              disabled={orderBusy}
              onClick={() => openOffPremise("DELIVERY")}
            >
              Delivery
            </Button> : null}
            <div className="live-chip">
              <span />
              {available.length} disponibles · {data.metrics.occupiedTables} en
              atención
            </div>
          </div>
        }
      />
      <nav className="floor-workspace-tabs" aria-label="Vistas del salón">
        <button type="button" aria-pressed={!showActivity} onClick={() => setShowActivity(false)}>Mesas y pedido</button>
        {canViewStaff ? <button type="button" aria-pressed={showActivity} onClick={() => setShowActivity(true)}><Users size={16} /> Actividad del personal</button> : null}
      </nav>
      {showActivity && canViewStaff ? <StaffActivity /> : null}
      <section style={showActivity && canViewStaff ? { display: "none" } : undefined} className={`floor-order-layout floor-order-layout--compact floor-order-layout--${workspaceView}`}>
        <div className="floor-order-layout__tables">
          <FloorMap
            disabled={orderBusy}
            canWrite={hasPermission(permissions, "restaurant:floor:write")}
            tables={data.tables}
            focusedId={effectiveFocusedId}
            onFocus={focusTable}
            businessName={businessName}
            locale={locale}
          />
        </div>
        <div className="floor-order-layout__work">
          {workspaceView === "active" && focused?.activeOrder ? (
            <ActiveOrderPanel
              key={focused.activeOrder.id}
              permissions={permissions}
              order={focused.activeOrder}
              products={data.products}
              paymentMethods={data.paymentMethods}
              warningMinutes={data.configuration.kitchen.warningMinutes}
              criticalMinutes={data.configuration.kitchen.criticalMinutes}
              splitPaymentsEnabled={data.configuration.sales.splitPaymentsEnabled}
            />
          ) : workspaceView === "tables" && focused && focused.status !== "AVAILABLE" ? (
            <Card className="floor-table-detail">
              <h2>{focused.name}</h2>
              <TableOperationalStatus table={focused} locale={locale} />
              {focused.reservation ? <>
                <p>Reserva: {focused.reservation.name}</p>
                <p>{focused.reservation.partySize ? `${focused.reservation.partySize} personas` : "Personas por confirmar"}{focused.reservation.reservedAt ? ` · ${formatDateTime(focused.reservation.reservedAt)}` : ""}</p>
              </> : <p>Gestiona el estado de esta mesa desde sus acciones.</p>}
            </Card>
          ) : hasPermission(permissions, "restaurant:orders:write") ? (
            <NewOrderComposer
              canCreateCustomer={hasPermission(permissions, "customers:write")}
              key={draftKey}
              draftKey={draftKey}
              initialDraft={drafts[draftKey]}
              onDraftChange={saveDraft}
              onBusy={setOrderBusy}
              onSourceChange={changeOrderSource}
              data={data}
              tableId={orderTableId}
              initialSource={orderSource}
              onTableChange={changeOrderTable}
              onFocusTable={focusTable}
              onCreated={(message) => {
                if (orderSource === "DINE_IN") setFocusedId(orderTableId);
                setWorkspaceView(orderSource === "DINE_IN" ? "active" : "new");
                setFloorNotice(message);
              }}
            />
          ) : <p className="empty-state">Selecciona una mesa para consultar su pedido.</p>}
        </div>
      </section>
      {floorNotice ? (
        <div className="inline-toast inline-toast--success" role="status">
          <CheckCircle2 size={17} />
          {floorNotice}
        </div>
      ) : null}
    </>
  );
}
