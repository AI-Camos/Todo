import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { subtasks } from "@/lib/db/schema";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// PATCH /api/subtasks/:id — renombra la subtarea. La tarea madre no se cambia:
// mover una subtarea de tarea rompería los bloques que ya la referencian.
export async function PATCH(request: NextRequest, { params }: Context) {
  const id = parseId((await params).id);
  if (id === null) {
    return Response.json({ error: "id inválido" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const raw = (body as Record<string, unknown>).title;
  const title = typeof raw === "string" ? raw.trim() : "";
  if (!title) {
    return Response.json(
      { error: "El título no puede estar vacío" },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(subtasks)
    .set({ title })
    .where(eq(subtasks.id, id))
    .returning();

  if (!updated) {
    return Response.json({ error: "Subtarea no encontrada" }, { status: 404 });
  }
  return Response.json(updated);
}

// DELETE /api/subtasks/:id — la borra del catálogo. Los bloques que la usaban
// NO se borran: su `subtask_id` pasa a null (ON DELETE SET NULL) y se quedan
// como bloques de la tarea a secas.
export async function DELETE(_request: NextRequest, { params }: Context) {
  const id = parseId((await params).id);
  if (id === null) {
    return Response.json({ error: "id inválido" }, { status: 400 });
  }

  const [deleted] = await db
    .delete(subtasks)
    .where(eq(subtasks.id, id))
    .returning();

  if (!deleted) {
    return Response.json({ error: "Subtarea no encontrada" }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
