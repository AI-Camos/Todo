import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scheduleBlocks, subtasks, todoStatus } from "@/lib/db/schema";
import type { TodoStatus } from "@/lib/db/schema";
import { findBlock } from "@/lib/db/blocks";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const STATUSES = todoStatus.enumValues as readonly string[];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Horas y duraciones en pasos de 0.5 (medias horas): 6.5 = 06:30.
const isHalfStep = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && Number.isInteger(n * 2);

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// PATCH /api/schedule/:id — cambia el estado del bloque y/o lo mueve (date/hour).
export async function PATCH(request: NextRequest, { params }: Context) {
  const id = parseId((await params).id);
  if (id === null) {
    return Response.json({ error: "id inválido" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { status, date, hour, duration, subtaskId } = body as Record<
    string,
    unknown
  >;

  const updates: Partial<{
    status: TodoStatus;
    date: string;
    hour: number;
    duration: number;
    subtaskId: number | null;
  }> = {};
  if (status !== undefined) {
    if (typeof status !== "string" || !STATUSES.includes(status)) {
      return Response.json({ error: "status inválido" }, { status: 400 });
    }
    updates.status = status as TodoStatus;
  }
  if (date !== undefined) {
    if (typeof date !== "string" || !DATE_RE.test(date)) {
      return Response.json({ error: "date inválida (YYYY-MM-DD)" }, { status: 400 });
    }
    updates.date = date;
  }
  if (hour !== undefined) {
    if (!isHalfStep(hour) || hour < 0 || hour > 23.5) {
      return Response.json(
        { error: "hour inválida (0-23.5, pasos de 0.5)" },
        { status: 400 },
      );
    }
    updates.hour = hour;
  }
  if (duration !== undefined) {
    if (!isHalfStep(duration) || duration < 0.5) {
      return Response.json(
        { error: "duration inválida (>=0.5, pasos de 0.5)" },
        { status: 400 },
      );
    }
    updates.duration = duration;
  }
  // `subtaskId: null` es una actualización válida: quita la subtarea del bloque
  // y lo deja como la tarea a secas. La comprobación de que la subtarea sea de
  // ESTA tarea va más abajo, cuando ya sabemos a qué tarea pertenece el bloque.
  if (subtaskId !== undefined) {
    if (
      subtaskId !== null &&
      (typeof subtaskId !== "number" ||
        !Number.isInteger(subtaskId) ||
        subtaskId <= 0)
    ) {
      return Response.json({ error: "subtaskId inválido" }, { status: 400 });
    }
    updates.subtaskId = subtaskId as number | null;
  }
  if (Object.keys(updates).length === 0) {
    return Response.json(
      {
        error:
          "Nada que actualizar (envía status, date, hour, duration o subtaskId)",
      },
      { status: 400 },
    );
  }

  const [current] = await db
    .select()
    .from(scheduleBlocks)
    .where(eq(scheduleBlocks.id, id));
  if (!current) {
    return Response.json({ error: "Bloque no encontrado" }, { status: 404 });
  }

  // El bloque (con los valores efectivos) no puede pasar de medianoche.
  const effHour = updates.hour ?? current.hour;
  const effDur = updates.duration ?? current.duration;
  if (effHour + effDur > 24) {
    return Response.json(
      { error: "El bloque se pasa de medianoche (hour + duration > 24)" },
      { status: 400 },
    );
  }

  // La subtarea tiene que ser de la tarea del bloque (el FK no lo comprueba).
  if (updates.subtaskId != null) {
    const [row] = await db
      .select()
      .from(subtasks)
      .where(eq(subtasks.id, updates.subtaskId));
    if (!row || row.todoId !== current.todoId) {
      return Response.json(
        { error: "La subtarea no existe o no pertenece a esa tarea" },
        { status: 400 },
      );
    }
  }

  await db.update(scheduleBlocks).set(updates).where(eq(scheduleBlocks.id, id));

  // Devolvemos el bloque enriquecido (con `subtaskTitle`) para que la UI pueda
  // fusionar la respuesta tal cual: la fila cruda dejaría el título anterior.
  return Response.json(await findBlock(id));
}

// DELETE /api/schedule/:id — quita el bloque del calendario.
export async function DELETE(_request: NextRequest, { params }: Context) {
  const id = parseId((await params).id);
  if (id === null) {
    return Response.json({ error: "id inválido" }, { status: 400 });
  }

  const [deleted] = await db
    .delete(scheduleBlocks)
    .where(eq(scheduleBlocks.id, id))
    .returning();

  if (!deleted) {
    return Response.json({ error: "Bloque no encontrado" }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
