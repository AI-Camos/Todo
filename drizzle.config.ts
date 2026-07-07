import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Carga variables de entorno desde .env.local (donde vive DATABASE_URL).
config({ path: ".env.local" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
