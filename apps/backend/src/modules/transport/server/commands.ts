import "server-only";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import type { TransportCommandHandler } from "./command-types";
import { handleFinanceCommand } from "./commands/finance";
import { handleFleetCommand } from "./commands/fleet";
import { handleFuelCommand } from "./commands/fuel";
import { handleMaintenanceCommand } from "./commands/maintenance";
import { handleMasterCommand } from "./commands/masters";
import { handleOperationsCommand } from "./commands/operations";
import { handleTireCommand } from "./commands/tires";
import { handleWorkforceCommand } from "./commands/workforce";
import { handleConfigurationCommand } from "./commands/configuration";

const handlers: TransportCommandHandler[] = [
  handleConfigurationCommand,
  handleMasterCommand,
  handleFleetCommand,
  handleWorkforceCommand,
  handleOperationsCommand,
  handleFinanceCommand,
  handleFuelCommand,
  handleMaintenanceCommand,
  handleTireCommand,
];

export async function handleTransportCommand(method: string, segments: string[], body: unknown, scope: TenantScope) {
  for (const handler of handlers) {
    const result = await handler(method, segments, body, scope);
    if (result) return result;
  }
  throw new AppError("NOT_FOUND", 404, "Operación de Transporte no encontrada.");
}
