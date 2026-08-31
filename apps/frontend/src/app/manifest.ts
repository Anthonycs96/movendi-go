import type { MetadataRoute } from "next";
import { APP_DESCRIPTION, APP_NAME } from "@/shared/config/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#f4f4f5",
    theme_color: "#116bc8",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
