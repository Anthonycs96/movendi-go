import "server-only";

import { AppError } from "@/core/auth/errors";
import { saveTransportConfigurationSection, type TransportConfigurationSection } from "../configuration";
import type { TransportCommandHandler } from "../command-types";

const sections = new Set<TransportConfigurationSection>(["general", "operations", "customers", "fleet", "drivers", "finance", "maintenance", "documents", "safety", "notifications", "integrations", "modules"]);

export const handleConfigurationCommand: TransportCommandHandler = async (method, segments, body, scope) => {
  const [resource, section] = segments;
  if (resource !== "configuration") return null;
  if (method !== "PATCH" || !section || !sections.has(section as TransportConfigurationSection)) throw new AppError("NOT_FOUND", 404, "Sección de configuración no encontrada.");
  const configuration = await saveTransportConfigurationSection(scope.tenantId, section as TransportConfigurationSection, body, scope);
  return { ok: true, id: scope.tenantId, configuration, message: "Configuración de Transporte actualizada." };
};
