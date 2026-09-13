import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      next: { rootDir: "apps/frontend" },
    },
  },
  {
    files: ["apps/backend/src/modules/inventory/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { regex: "^@/modules/(?!inventory(?:/|$))", message: "Inventario recibe políticas; no importa otros rubros." },
          { group: ["**/restaurant/**", "**/transport/**", "**/barbershop/**", "**/core/composition/**"], message: "La composición por rubro pertenece al adaptador de entrada." },
        ],
      }],
    },
  },
  {
    files: ["apps/backend/src/core/database/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["@/modules/**", "**/modules/**"], message: "La infraestructura de base de datos no depende de módulos de negocio." }] }],
    },
  },
  {
    files: ["apps/backend/src/modules/inventory/{domain,application}/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { regex: "^(?!\\.{1,2}/)", message: "Las capas internas de Inventario sólo dependen de sus contratos y dominio locales." },
          { group: ["**/infrastructure/**", "**/server/**", "**/core/**", "**/app/**"], message: "Dominio y aplicación no importan adaptadores ni servicios legacy." },
        ],
      }],
      "no-restricted-globals": ["error", "fetch", "Request", "Response", "Headers"],
    },
  },
  {
    files: ["apps/backend/src/modules/sales/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        { regex: "^@/modules/(?!sales(?:/|$))", message: "Ventas recibe datos del origen; no importa otros rubros." },
        { group: ["**/restaurant/**", "**/barbershop/**", "**/transport/**", "**/core/composition/**"], message: "Los adaptadores de origen pertenecen a su rubro." },
      ] }],
    },
  },
  {
    files: ["apps/backend/src/modules/sales/{domain,application}/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        { regex: "^(?!\\.{1,2}/)", message: "Ventas depende de sus puertos y dominio locales." },
        { group: ["**/infrastructure/**", "**/server/**", "**/core/**", "**/app/**"], message: "Las capas internas no importan adaptadores." },
      ] }],
      "no-restricted-globals": ["error", "fetch", "Request", "Response", "Headers"],
    },
  },
  {
    files: ["apps/backend/src/modules/sales/domain/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ regex: "^(?!\\./)", message: "El dominio de Ventas no depende de las capas externas." }] }],
    },
  },
  {
    files: ["apps/backend/src/modules/cash/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        { regex: "^@/modules/(?!cash(?:/|$))", message: "Caja recibe datos del origen; no importa otros rubros." },
        { group: ["**/restaurant/**", "**/barbershop/**", "**/transport/**", "**/core/composition/**"], message: "Los adaptadores de origen pertenecen a su rubro." },
      ] }],
    },
  },
  {
    files: ["apps/backend/src/modules/cash/{domain,application}/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        { regex: "^(?!\\.{1,2}/)", message: "Caja depende de sus puertos y dominio locales." },
        { group: ["**/infrastructure/**", "**/server/**", "**/core/**", "**/app/**"], message: "Las capas internas no importan adaptadores." },
      ] }],
      "no-restricted-globals": ["error", "fetch", "Request", "Response", "Headers"],
    },
  },
  {
    files: ["apps/backend/src/modules/cash/domain/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ regex: "^(?!\\./)", message: "El dominio de Caja no depende de las capas externas." }] }],
    },
  },
  {
    files: ["apps/backend/src/modules/inventory/domain/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ regex: "^(?!\\./)", message: "El dominio de Inventario no depende de las capas externas." }],
      }],
    },
  },
  {
    files: ["apps/backend/src/modules/{minimarket,invoicing,printing,restaurant,barbershop}/{domain,application}/**/*.ts"], ignores: ["**/*.test.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [
      { regex: "^(?!\\.{1,2}/)", message: "Las capacidades dependen de su dominio y puertos locales." },
      { group: ["**/infrastructure/**", "**/server/**", "**/core/**"], message: "Las capas internas no importan adaptadores." },
    ] }], "no-restricted-globals": ["error", "fetch", "Request", "Response"] },
  },
  globalIgnores([
    "**/.next/**",
    "**/node_modules/**",
    "**/playwright-report/**",
    "**/test-results/**",
    "**/next-env.d.ts",
  ]),
]);
