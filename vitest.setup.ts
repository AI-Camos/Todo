// Carga .env.local ANTES de importar cualquier módulo de test. Importa porque
// lib/db/index.ts construye el Pool de Postgres leyendo DATABASE_URL en el
// momento del import; si dotenv corriera dentro del test, ya sería tarde.
// Next inyecta .env.local solo; vitest no, de ahí este setup.
import { config } from "dotenv";

config({ path: ".env.local" });
