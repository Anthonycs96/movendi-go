import type { TenantScope } from "@/core/auth/types";

export type TransportCommandResult = {
  ok: true;
  id: string;
  message: string;
};

export type TransportCommandHandler = (
  method: string,
  segments: string[],
  body: unknown,
  scope: TenantScope,
) => Promise<TransportCommandResult | null>;
