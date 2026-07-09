import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scheduleBlocks, todoStatus } from "@/lib/db/schema";
import type { TodoStatus } from "@/lib/db/schema";

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
  const { status, date, hour, duration } = body as Record<string, unknown>;

  const updates: Partial<{
    status: TodoStatus;
    date: string;
    hour: number;
    duration: number;
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
  if (Object.keys(updates).length === 0) {
    return Response.json(
      { error: "Nada que actualizar (envía status, date, hour o duration)" },
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

  const [updated] = await db
    .update(scheduleBlocks)
    .set(updates)
    .where(eq(scheduleBlocks.id, id))
    .returning();

  return Response.json(updated);
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
