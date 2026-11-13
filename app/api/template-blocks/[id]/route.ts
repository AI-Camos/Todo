import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dayTemplates, templateBlocks } from "@/lib/db/schema";
import { findTemplateBlock } from "@/lib/db/blocks";
import {
  isPositiveInt,
  isValidDuration,
  isValidHour,
  subtaskBelongsTo,
} from "@/lib/schedule-rules";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

// PATCH /api/template-blocks/:id — { templateId?, hour?, duration?, subtaskId? }.
// Cambiar `templateId` mueve el bloque a otra plantilla (arrastrar entre columnas).
export async function PATCH(request: NextRequest, { params }: Context) {
  const id = Number((await params).id);
  if (!isPositiveInt(id)) {
    return Response.json({ error: "id inválido" }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { templateId, hour, duration, subtaskId } = body as Record<
    string,
    unknown
  >;

  const updates: Partial<{
    templateId: number;
    hour: number;
    duration: number;
    subtaskId: number | null;
  }> = {};
  if (templateId !== undefined) {
    if (!isPositiveInt(templateId)) {
      return Response.json({ error: "templateId inválido" }, { status: 400 });
    }
    updates.templateId = templateId;
  }
  if (hour !== undefined) {
    if (!isValidHour(hour)) {
      return Response.json(
        { error: "hour inválida (0-23.5, pasos de 0.5)" },
        { status: 400 },
      );
    }
    updates.hour = hour;
  }
  if (duration !== undefined) {
    if (!isValidDuration(duration)) {
      return Response.json(
        { error: "duration inválida (>=0.5, pasos de 0.5)" },
        { status: 400 },
      );
    }
    updates.duration = duration;
  }
  if (subtaskId !== undefined) {
    if (subtaskId !== null && !isPositiveInt(subtaskId)) {
      return Response.json({ error: "subtaskId inválido" }, { status: 400 });
    }
    updates.subtaskId = subtaskId;
  }
  if (Object.keys(updates).length === 0) {
    return Response.json(
      {
        error:
          "Nada que actualizar (envía templateId, hour, duration o subtaskId)",
      },
      { status: 400 },
    );
  }

  const [current] = await db
    .select()
    .from(templateBlocks)
    .where(eq(templateBlocks.id, id));
  if (!current) {
    return Response.json({ error: "Bloque no encontrado" }, { status: 404 });
  }
  if ((updates.hour ?? current.hour) + (updates.duration ?? current.duration) > 24) {
    return Response.json(
      { error: "El bloque se pasa de medianoche (hour + duration > 24)" },
      { status: 400 },
    );
  }
  if (updates.templateId !== undefined) {
    const [tpl] = await db
      .select({ id: dayTemplates.id })
      .from(dayTemplates)
      .where(eq(dayTemplates.id, updates.templateId));
    if (!tpl) {
      return Response.json({ error: "Plantilla no encontrada" }, { status: 404 });
    }
  }
  if (
    updates.subtaskId != null &&
    !(await subtaskBelongsTo(updates.subtaskId, current.todoId))
  ) {
    return Response.json(
      { error: "La subtarea no existe o no pertenece a esa tarea" },
      { status: 400 },
    );
  }

  await db.update(templateBlocks).set(updates).where(eq(templateBlocks.id, id));
  return Response.json(await findTemplateBlock(id));
}

// DELETE /api/template-blocks/:id
export async function DELETE(_request: NextRequest, { params }: Context) {
  const id = Number((await params).id);
  if (!isPositiveInt(id)) {
    return Response.json({ error: "id inválido" }, { status: 400 });
  }
  const [row] = await db
    .delete(templateBlocks)
    .where(eq(templateBlocks.id, id))
    .returning();
  if (!row) {
    return Response.json({ error: "Bloque no encontrado" }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
