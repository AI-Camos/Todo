import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dayTemplates } from "@/lib/db/schema";
import { isPositiveInt } from "@/lib/schedule-rules";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

// PATCH /api/day-templates/:id — renombra: { name }.
export async function PATCH(request: NextRequest, { params }: Context) {
  const id = Number((await params).id);
  if (!isPositiveInt(id)) {
    return Response.json({ error: "id inválido" }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const name =
    body && typeof body === "object" && typeof body.name === "string"
      ? body.name.trim()
      : "";
  if (!name) {
    return Response.json({ error: "Falta el nombre" }, { status: 400 });
  }
  const [row] = await db
    .update(dayTemplates)
    .set({ name })
    .where(eq(dayTemplates.id, id))
    .returning({ id: dayTemplates.id, name: dayTemplates.name });
  if (!row) {
    return Response.json({ error: "Plantilla no encontrada" }, { status: 404 });
  }
  return Response.json(row);
}

// DELETE /api/day-templates/:id — borra la plantilla y sus bloques (cascade).
// Los días a los que ya se aplicó NO cambian: aplicar es copiar.
export async function DELETE(_request: NextRequest, { params }: Context) {
  const id = Number((await params).id);
  if (!isPositiveInt(id)) {
    return Response.json({ error: "id inválido" }, { status: 400 });
  }
  const [row] = await db
    .delete(dayTemplates)
    .where(eq(dayTemplates.id, id))
    .returning();
  if (!row) {
    return Response.json({ error: "Plantilla no encontrada" }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
