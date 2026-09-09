"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { WandSparkles } from "lucide-react";
import { Button } from "@/shared/components/ui";
import type { PlatformBusinessView, PlatformPlanView, PlatformSetupTemplate } from "../types";

const Wizard = dynamic(() => import("./BusinessSetupWizard").then((module) => module.BusinessSetupWizard), {
  loading: () => <span role="status">Preparando configuración…</span>,
});

export function LazyBusinessSetupWizard({ plans, templates, business, triggerLabel = business ? "Configurar" : "Nuevo negocio" }: { plans: PlatformPlanView[]; templates: PlatformSetupTemplate[]; business?: PlatformBusinessView; triggerLabel?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  return <>
    <Button type="button" size="sm" variant={business?.setup.status === "READY" ? "ghost" : "primary"} onClick={() => { setLoaded(true); setOpen(true); }}><WandSparkles size={15} />{triggerLabel}</Button>
    {loaded ? <Wizard plans={plans} templates={templates} business={business} open={open} onOpenChange={setOpen} /> : null}
  </>;
}
