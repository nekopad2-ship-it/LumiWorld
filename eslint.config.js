import js from "@eslint/js";
import tseslint from "typescript-eslint";

const typedConfigs = tseslint.configs.recommendedTypeChecked.map((config) => ({
  ...config,
  files: ["**/*.ts"],
  languageOptions: {
    ...config.languageOptions,
    parserOptions: {
      ...config.languageOptions?.parserOptions,
      project: "./tsconfig.json",
    },
  },
}));

export default [
  {
    ignores: ["dist/**", "node_modules/**", "eslint.config.js"],
  },
  js.configs.recommended,
  ...typedConfigs,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
];
