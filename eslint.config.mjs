import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            "Render untrusted content as text. Review any HTML rendering against SECURITY.md.",
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    ".agents/**",
    ".foundation-cache/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);
