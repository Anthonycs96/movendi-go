"use client";

import Link, { useLinkStatus } from "next/link";
import { useEffect, useRef, useState, type ComponentProps } from "react";

function NavigationHint() {
  const { pending } = useLinkStatus();
  return <span className="navigation-hint" data-pending={pending || undefined} aria-hidden="true" />;
}

// Warm only the layout/loading boundary on intent. Operational page data stays fresh.
export function NavigationLink({ children, onMouseEnter, onMouseLeave, onFocus, onBlur, onClick, ...props }: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  function prepare() {
    clearTimeout(timer.current);
    // A passing pointer or an immediate tap should not compete with the real navigation.
    timer.current = setTimeout(() => setIntent(true), 150);
  }
  return <Link {...props} prefetch={intent ? null : false}
    onMouseEnter={(event) => { prepare(); onMouseEnter?.(event); }}
    onMouseLeave={(event) => { clearTimeout(timer.current); onMouseLeave?.(event); }}
    onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) prepare(); onFocus?.(event); }}
    onBlur={(event) => { clearTimeout(timer.current); onBlur?.(event); }}
    onClick={(event) => { clearTimeout(timer.current); onClick?.(event); }}
  >{children}<NavigationHint /></Link>;
}
