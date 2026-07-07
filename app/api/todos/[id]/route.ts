import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { todos } from "@/lib/db/schema";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
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
  const { title, completed } = body as Record<string, unknown>;

  const updates: Partial<{ title: string; completed: boolean }> = {};
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
  if (typeof completed === "boolean") {
    updates.completed = completed;
  }
  if (Object.keys(updates).length === 0) {
    return Response.json(
      { error: "Nada que actualizar (envía title o completed)" },
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
