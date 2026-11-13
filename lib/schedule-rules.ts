import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { subtasks } from "@/lib/db/schema";

// Reglas de un bloque horario, compartidas por el calendario y las plantillas.

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Horas y duraciones van en pasos de 0.5 (medias horas): 6.5 = 06:30.
export const isHalfStep = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && Number.isInteger(n * 2);

export const isPositiveInt = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n > 0;

export const isValidHour = (h: unknown): h is number =>
  isHalfStep(h) && h >= 0 && h <= 23.5;

export const isValidDuration = (d: unknown): d is number =>
  isHalfStep(d) && d >= 0.5;

// El FK solo garantiza que la subtarea exista, no que sea de ESTA tarea.
export async function subtaskBelongsTo(subtaskId: number, todoId: number) {
  const [row] = await db
    .select({ todoId: subtasks.todoId })
    .from(subtasks)
    .where(eq(subtasks.id, subtaskId));
  return row?.todoId === todoId;
}
