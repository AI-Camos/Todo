import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { todos, todoStatus, todoPriority } from "@/lib/db/schema";
import type { TodoStatus, TodoPriority } from "@/lib/db/schema";
import { isTaskColor, type TaskColor } from "@/lib/colors";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const STATUSES = todoStatus.enumValues as readonly string[];
const PRIORITIES = todoPriority.enumValues as readonly string[];

export function parseId(raw: string): number | null {
  const id = Number(raw);
  // Los ids son `serial` (>= 1); Number("") es 0, así que exigimos positivo.
  return Number.isInteger(id) && id > 0 ? id : null;
}

// PATCH /api/todos/:id — edita título y/o estado completado.
export async function PATCH(request: NextRequest, { params }: Context) {
  const id = parseId((await params).id);
  if (id === null) {
    return Response.json({ error: "id inválido" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { title, status, priority, color } = body as Record<string, unknown>;

  const updates: Partial<{
    title: string;
    status: TodoStatus;
    priority: TodoPriority;
    color: TaskColor | null;
  }> = {};
  if (typeof title === "string") {
    const trimmed = title.trim();
    if (!trimmed) {
      return Response.json(
        { error: "El título no puede estar vacío" },
        { status: 400 },
      );
    }
    updates.title = trimmed;
  }
  if (status !== undefined) {
    if (typeof status !== "string" || !STATUSES.includes(status)) {
      return Response.json({ error: "status inválido" }, { status: 400 });
    }
    updates.status = status as TodoStatus;
  }
  if (priority !== undefined) {
    if (typeof priority !== "string" || !PRIORITIES.includes(priority)) {
      return Response.json({ error: "priority inválido" }, { status: 400 });
    }
    updates.priority = priority as TodoPriority;
  }
  // `color: null` es una actualización válida: vuelve al color automático.
  if (color !== undefined) {
    if (color !== null && !isTaskColor(color)) {
      return Response.json({ error: "color inválido" }, { status: 400 });
    }
    updates.color = color as TaskColor | null;
  }
  if (Object.keys(updates).length === 0) {
    return Response.json(
      { error: "Nada que actualizar (envía title, status, priority o color)" },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(todos)
    .set(updates)
    .where(eq(todos.id, id))
    .returning();

  if (!updated) {
    return Response.json({ error: "Tarea no encontrada" }, { status: 404 });
  }
  return Response.json(updated);
}

// DELETE /api/todos/:id — elimina una tarea.
export async function DELETE(_request: NextRequest, { params }: Context) {
  const id = parseId((await params).id);
  if (id === null) {
    return Response.json({ error: "id inválido" }, { status: 400 });
  }

  const [deleted] = await db
    .delete(todos)
    .where(eq(todos.id, id))
    .returning();

  if (!deleted) {
    return Response.json({ error: "Tarea no encontrada" }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
