import Anthropic from "@anthropic-ai/sdk";

// El cliente se construye tarde, no al importar el módulo: `new Anthropic()`
// lanza si no hay credenciales, y este módulo lo importan el build de Next y los
// tests, que no siempre tienen una API key a mano.
const globalForAnthropic = globalThis as unknown as { anthropic?: Anthropic };

export function getAnthropic(): Anthropic {
  if (globalForAnthropic.anthropic) return globalForAnthropic.anthropic;

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Falta ANTHROPIC_API_KEY en .env.local — el agente no puede arrancar.",
    );
  }

  const client = new Anthropic(); // lee ANTHROPIC_API_KEY del entorno
  if (process.env.NODE_ENV !== "production") globalForAnthropic.anthropic = client;
  return client;
}

// La app es agnóstica al modelo: ningún route handler escribe un id de modelo.
// Cambiar de modelo es una variable de entorno, y las evals pueden barrer varios
// modelos sin tocar código.
export const CHAT_MODEL = process.env.ANTHROPIC_MODEL_CHAT ?? "claude-haiku-4-5";
export const PLAN_MODEL = process.env.ANTHROPIC_MODEL_PLAN ?? CHAT_MODEL;

export const CHAT_MAX_TOKENS = 8192;
