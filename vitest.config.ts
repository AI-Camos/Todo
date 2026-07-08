import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // Entorno Node: nuestros primeros tests son de lógica pura (sin DOM).
    // Cuando probemos componentes React, cambiaremos a "jsdom".
    environment: "node",
    // Descubre archivos *.test.ts en todo el repo.
    include: ["**/*.test.ts", "**/*.test.tsx"],
  },
  resolve: {
    // Replica el alias "@/*" -> raíz del proyecto que usa Next (tsconfig.json).
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
