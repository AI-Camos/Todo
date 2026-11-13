import type { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dayTemplates, templateBlocks, todos } from "@/lib/db/schema";
import { findTemplateBlock, templateBlockQuery } from "@/lib/db/blocks";
import {
  isPositiveInt,
  isValidDuration,
  isValidHour,
  subtaskBelongsTo,
} from "@/lib/schedule-rules";

export const runtime = "nodejs";

// GET /api/template-blocks — todos los bloques de todas las plantillas, de una
// vez: la vista de días modelo las pinta todas lado a lado.
export async function GET() {
  const rows = await templateBlockQuery().orderBy(
    asc(templateBlocks.hour),
    asc(templateBlocks.id),
  );
  return Response.json(rows);
}

// POST /api/template-blocks — { templateId, todoId, hour, duration?, subtaskId? }.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { templateId, todoId, hour, duration = 1, subtaskId = null } =
    body as Record<string, unknown>;

  if (!isPositiveInt(templateId)) {
    return Response.json({ error: "templateId inválido" }, { status: 400 });
  }
  if (!isPositiveInt(todoId)) {
    return Response.json({ error: "todoId inválido" }, { status: 400 });
  }
  if (!isValidHour(hour)) {
    return Response.json(
      { error: "hour inválida (0-23.5, pasos de 0.5)" },
      { status: 400 },
    );
  }
  if (!isValidDuration(duration)) {
    return Response.json(
      { error: "duration inválida (>=0.5, pasos de 0.5)" },
      { status: 400 },
    );
  }
  if (hour + duration > 24) {
    return Response.json(
      { error: "El bloque se pasa de medianoche (hour + duration > 24)" },
      { status: 400 },
    );
  }
  if (subtaskId !== null && !isPositiveInt(subtaskId)) {
    return Response.json({ error: "subtaskId inválido" }, { status: 400 });
  }

  const [tpl] = await db
    .select({ id: dayTemplates.id })
    .from(dayTemplates)
    .where(eq(dayTemplates.id, templateId));
  if (!tpl) {
    return Response.json({ error: "Plantilla no encontrada" }, { status: 404 });
  }
  const [todo] = await db
    .select({ id: todos.id })
    .from(todos)
    .where(eq(todos.id, todoId));
  if (!todo) {
    return Response.json({ error: "Tarea no encontrada" }, { status: 404 });
  }
  if (subtaskId !== null && !(await subtaskBelongsTo(subtaskId, todoId))) {
    return Response.json(
      { error: "La subtarea no existe o no pertenece a esa tarea" },
      { status: 400 },
    );
  }

  const [created] = await db
    .insert(templateBlocks)
    .values({ templateId, todoId, subtaskId, hour, duration })
    .returning();
  return Response.json(await findTemplateBlock(created.id), { status: 201 });
}
