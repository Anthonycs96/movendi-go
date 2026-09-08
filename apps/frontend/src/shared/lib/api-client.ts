import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import type { PlatformWorkspaceResponse, SessionContextResponse, TenantWorkspaceResponse } from "@movendi/contracts";
import { backendFetch } from "./backend-fetch";

const apiOrigin = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";

export class ApiClientError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const cookie = (await headers()).get("cookie");
  const response = await backendFetch(`${apiOrigin}${path}`, {
    headers: cookie ? { cookie } : undefined,
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new ApiClientError(response.status, payload?.error?.message ?? "El backend no pudo completar la solicitud.");
  }
  return response.json() as Promise<T>;
}

async function nullableSessionRequest<T>(path: string): Promise<T | null> {
  try {
    return await getJson<T>(path);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return null;
    throw error;
  }
}

// Deduplicate layout/page reads within one render only; never share sessions across requests.
export const getSessionContext = cache(() => nullableSessionRequest<SessionContextResponse>("/api/auth/session"));

export function getTenantWorkspace(section?: string, filters?: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  if (section) query.set("section", section);
  for (const [key, value] of Object.entries(filters ?? {})) if (value) query.set(key, value);
  const suffix = query.size ? `?${query.toString()}` : "";
  return nullableSessionRequest<TenantWorkspaceResponse>(`/api/data/tenant${suffix}`);
}

export function getPlatformWorkspace() {
  return nullableSessionRequest<PlatformWorkspaceResponse>("/api/data/platform");
}

export interface PublicBillingPlan {
  id: string;
  key: string;
  name: string;
  description: string | null;
  monthlyPriceCents: number;
  maxUsers: number;
  maxMonthlyOperations: number;
  features: string[];
}

export interface PublicCheckoutView {
  id: string;
  provider: string;
  status: string;
  businessName: string | null;
  email: string;
  amountCents: number;
  currency: string;
  expiresAt: string;
  completedAt: string | null;
  tenantSlug: string | null;
  plan: { key: string; name: string };
}

export interface PublicBusinessSite {
  slug: string; name: string; shortName: string; type: "BARBERSHOP" | "RESTAURANT" | "TRANSPORT"; locale: string; currency: string;
  headline: string; description: string; primaryColor: string; email: string | null; phone: string | null; address: string | null; whatsapp: string | null; instagram: string | null;
  branches: Array<{ id: string; name: string; address: string | null; phone: string | null }>;
  services: Array<{ id: string; name: string; category: string | null; durationMinutes: number; priceCents: number }>;
  products: Array<{ id: string; name: string; description: string | null; priceCents: number; category: { name: string } }>;
  promotions: Array<{ id: string; name: string; kind: string; value: number; buyQuantity: number; freeQuantity: number; code: string | null }>;
}

export async function getPublicBusinessSite(slug: string) {
  return getJson<{ site: PublicBusinessSite }>(`/api/public/sites/${encodeURIComponent(slug)}`);
}

export async function getPublicBillingPlans() {
  return getJson<{ plans: PublicBillingPlan[] }>("/api/billing/plans");
}

export async function getPublicCheckout(id: string) {
  return getJson<{ checkout: PublicCheckoutView }>(`/api/billing/checkout/${encodeURIComponent(id)}`);
}
