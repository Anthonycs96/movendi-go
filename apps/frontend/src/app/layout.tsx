import type { Metadata } from "next";
import Script from "next/script";
import { APP_DESCRIPTION, APP_LOGO, APP_NAME } from "@/shared/config/brand";
import "./globals.css";

const themeBootstrap = `
(() => {
  try {
    const stored = window.localStorage.getItem("saas-v2-theme-mode");
    const mode = stored === "light" || stored === "dark" ? stored : "system";
    const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dataset.themeMode = mode;
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  } catch {}
})();`;

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: APP_NAME,
  description: APP_DESCRIPTION,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: APP_LOGO, type: "image/png", sizes: "512x512" },
      { url: "/pwa/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    shortcut: APP_LOGO,
    apple: "/pwa/icon-192.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es" suppressHydrationWarning>
    <body><Script id="movendi-theme-bootstrap" strategy="beforeInteractive">{themeBootstrap}</Script>{children}</body>
  </html>;
}
