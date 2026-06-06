import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Cloudflare Pages edge runtime does not support next/image optimization,
    // so plain <img> is intentional throughout this project.
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
