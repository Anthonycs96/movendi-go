export type RestaurantPreparationAreaType = "KITCHEN" | "BAR" | "GRILL" | "DESSERT" | "BEVERAGE" | "CUSTOM";
export type RestaurantAreaConfidence = "HIGH" | "MEDIUM" | "USER";
export type RestaurantAreaAssignmentMode = "INHERIT_FROM_PRODUCT" | "SPECIFIC_AREA";
export type RestaurantAreaDispatchMode = "KDS" | "PRINTER" | "NONE";

export interface NormalizedRestaurantArea {
  key: string;
  name: string;
  type: RestaurantPreparationAreaType;
  confidence: RestaurantAreaConfidence;
}

export interface DetectedRestaurantArea extends NormalizedRestaurantArea {
  aliases: string[];
  itemCount: number;
}

const knownAreas: Array<{ aliases: string[]; key: string; name: string; type: RestaurantPreparationAreaType; confidence: RestaurantAreaConfidence }> = [
  { aliases: ["COCINA", "COCINAS", "KITCHEN", "KITCHENS"], key: "KITCHEN", name: "Cocina", type: "KITCHEN", confidence: "HIGH" },
  { aliases: ["BAR", "BARS", "BARRA", "BARRAS"], key: "BAR", name: "Bar", type: "BAR", confidence: "HIGH" },
  { aliases: ["PARRILLA", "PARRILLAS", "GRILL", "GRILLS"], key: "GRILL", name: "Parrilla", type: "GRILL", confidence: "HIGH" },
  { aliases: ["POSTRE", "POSTRES", "PASTELERIA", "PASTELERIAS", "REPOSTERIA", "REPOSTERIAS"], key: "DESSERT", name: "Postres", type: "DESSERT", confidence: "HIGH" },
  // Bebidas intentionally remains separate from BAR: the business must confirm the routing.
  { aliases: ["BEBIDA", "BEBIDAS"], key: "BEVERAGE", name: "Bebidas", type: "BEVERAGE", confidence: "MEDIUM" },
];

function comparable(value: string) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, " ").trim().toUpperCase();
}

export function normalizeRestaurantCatalogLabel(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  return { key: comparable(name), name };
}

export function normalizeRestaurantArea(value: string): NormalizedRestaurantArea | null {
  const normalized = comparable(value);
  if (!normalized) return null;
  const known = knownAreas.find((area) => area.aliases.includes(normalized));
  if (known) return { key: known.key, name: known.name, type: known.type, confidence: known.confidence };
  const key = `CUSTOM_${normalized.replace(/\s+/g, "_").slice(0, 64)}`;
  const name = value.trim().replace(/\s+/g, " ").replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase());
  return { key, name, type: "CUSTOM", confidence: "USER" };
}

export function detectRestaurantAreas(values: string[]): DetectedRestaurantArea[] {
  const grouped = new Map<string, DetectedRestaurantArea>();
  for (const value of values) {
    const area = normalizeRestaurantArea(value);
    if (!area) continue;
    const alias = value.trim().replace(/\s+/g, " ");
    const current = grouped.get(area.key) ?? { ...area, aliases: [], itemCount: 0 };
    current.itemCount += 1;
    if (alias && !current.aliases.some((item) => comparable(item) === comparable(alias))) current.aliases.push(alias);
    grouped.set(area.key, current);
  }
  return [...grouped.values()].sort((left, right) => right.itemCount - left.itemCount || left.name.localeCompare(right.name));
}
