import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scheduleBlocks, subtasks, todos } from "@/lib/db/schema";

// Forma que consume el calendario: el bloque enriquecido con datos de la tarea
// y de su subtarea. Vive aquí y no en un `route.ts` porque los route handlers
// de App Router solo admiten exports concretos (GET, POST, runtime…), así que
// no pueden compartir constantes entre sí.
export const blockShape = {
  id: scheduleBlocks.id,
  todoId: scheduleBlocks.todoId,
  subtaskId: scheduleBlocks.subtaskId,
  date: scheduleBlocks.date,
  hour: scheduleBlocks.hour,
  duration: scheduleBlocks.duration,
  status: scheduleBlocks.status,
  title: todos.title,
  priority: todos.priority,
  color: todos.color,
  subtaskTitle: subtasks.title, // null si el bloque no tiene subtarea
};

// `leftJoin` con subtasks (no inner): la subtarea es opcional.
export const blockQuery = () =>
  db
    .select(blockShape)
    .from(scheduleBlocks)
    .innerJoin(todos, eq(scheduleBlocks.todoId, todos.id))
    .leftJoin(subtasks, eq(scheduleBlocks.subtaskId, subtasks.id));

// Devuelve un bloque ya enriquecido. Se usa tras un INSERT/UPDATE para que la
// respuesta tenga la misma forma que el GET y la UI pueda fusionarla directa.
export async function findBlock(id: number) {
  const [row] = await blockQuery().where(eq(scheduleBlocks.id, id));
  return row ?? null;
}
