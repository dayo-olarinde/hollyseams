import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for Nest's decorator-based DI.
 *
 * Vite's default esbuild transform strips TypeScript types but does not emit
 * `design:paramtypes`. Nest uses that metadata to resolve constructor dependencies, so
 * DI-driven tests fail with a misleading "can't resolve dependencies" error without SWC.
 * `unplugin-swc` reads the decorator settings from `tsconfig.json` and preserves the
 * metadata. The runner remains Vitest; `@nestjs/testing` is runner-agnostic.
 */
export default defineConfig({
  plugins: [swc.vite({ tsconfigFile: "./tsconfig.json" })],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Set test variables before imports evaluate `AppModule` and validate configuration.
    setupFiles: ["tests/setup-env.ts"],
  },
});
