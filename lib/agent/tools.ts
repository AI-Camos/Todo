import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { todos, todoStatus, todoPriority } from "@/lib/db/schema";

// Tope duro: el modelo NO puede pedir más de esto. Volcar 200 tareas en el
// contexto es el modo de fallo más común de un agente. El límite vive aquí, no
// en la confianza de que el modelo pida un número razonable.
const MAX_LIMIT = 25;

export const consultarTareas = betaZodTool({
  name: "consultar_tareas",
  // La descripción decide CUÁNDO se llama. Prescriptiva, no descriptiva.
  description:
    "Consulta las tareas del usuario. Llama a esto cuando el usuario pregunte " +
    "qué tiene pendiente, cuántas tareas hay, qué hay en un estado o prioridad " +
    "concretos, o antes de razonar sobre su lista. Devuelve un resumen, no la " +
    "lista completa.",
  inputSchema: z.object({
    status: z
      .enum(todoStatus.enumValues)
      .optional()
      .describe("Filtra por estado del tablero Kanban. Omite para todos."),
    priority: z
      .enum(todoPriority.enumValues)
      .optional()
      .describe("Filtra por prioridad. Omite para todas."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_LIMIT)
      .default(10)
      .describe(`Máximo de tareas a devolver (tope ${MAX_LIMIT}).`),
  }),
  run: async ({ status, priority, limit }) => {
    const conds = [];
    if (status) conds.push(eq(todos.status, status));
    if (priority) conds.push(eq(todos.priority, priority));

    const rows = await db
      .select()
      .from(todos)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(todos.createdAt))
      .limit(limit);

    const filtro = [
      status ? `estado=${status}` : null,
      priority ? `prioridad=${priority}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const cabecera = filtro ? `Tareas (${filtro})` : "Tareas";

    if (rows.length === 0) {
      return `${cabecera}: ninguna.`;
    }

    const lineas = rows.map(
      (t) => `#${t.id} [${t.status}/${t.priority}] ${t.title}`,
    );
    return `${cabecera}: ${rows.length}\n${lineas.join("\n")}`;
  },
});

export const crearTarea = betaZodTool({
  name: "crear_tarea",
  description:
    "Crea una tarea nueva. Llama a esto cuando el usuario pida añadir, apuntar " +
    "o recordar algo que tenga que hacer. La tarea entra en estado 'todo'.",
  inputSchema: z.object({
    title: z
      .string()
      .trim()
      .min(1)
      .describe("Título breve de la tarea, tal como lo diría el usuario."),
    priority: z
      .enum(todoPriority.enumValues)
      .default("medium")
      .describe("Prioridad. 'high' si el usuario marca urgencia; si no, 'medium'."),
  }),
  run: async ({ title, priority }) => {
    const [row] = await db
      .insert(todos)
      .values({ title, priority })
      .returning();
    return `Creada la tarea #${row.id}: "${row.title}" (prioridad ${row.priority}, estado ${row.status}).`;
  },
});
