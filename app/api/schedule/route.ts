import type { NextRequest } from "next/server";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { scheduleBlocks, todos } from "@/lib/db/schema";

// pg/drizzle requieren runtime Node (no edge).
export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Las horas y duraciones van en pasos de 0.5 (medias horas): 6.5 = 06:30.
const isHalfStep = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && Number.isInteger(n * 2);

// Forma que consume el calendario: el bloque enriquecido con datos de la tarea.
const blockShape = {
  id: scheduleBlocks.id,
  todoId: scheduleBlocks.todoId,
  date: scheduleBlocks.date,
  hour: scheduleBlocks.hour,
  duration: scheduleBlocks.duration,
  status: scheduleBlocks.status,
  title: todos.title,
  priority: todos.priority,
};

// GET /api/schedule?start=YYYY-MM-DD&end=YYYY-MM-DD
// Devuelve los bloques del rango (típicamente una semana), con título y prioridad.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!start || !end || !DATE_RE.test(start) || !DATE_RE.test(end)) {
    return Response.json(
      { error: "Faltan/invalidas start y end (YYYY-MM-DD)" },
      { status: 400 },
    );
  }

  const rows = await db
    .select(blockShape)
    .from(scheduleBlocks)
    .innerJoin(todos, eq(scheduleBlocks.todoId, todos.id))
    .where(and(gte(scheduleBlocks.date, start), lte(scheduleBlocks.date, end)))
    .orderBy(asc(scheduleBlocks.hour), asc(scheduleBlocks.createdAt));

  return Response.json(rows);
}

// POST /api/schedule — coloca una tarea en un día/hora: { todoId, date, hour }.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { todoId, date, hour, duration } = body as Record<string, unknown>;

  if (typeof todoId !== "number" || !Number.isInteger(todoId) || todoId <= 0) {
    return Response.json({ error: "todoId inválido" }, { status: 400 });
  }
  if (typeof date !== "string" || !DATE_RE.test(date)) {
    return Response.json({ error: "date inválida (YYYY-MM-DD)" }, { status: 400 });
  }
  if (!isHalfStep(hour) || hour < 0 || hour > 23.5) {
    return Response.json(
      { error: "hour inválida (0-23.5, pasos de 0.5)" },
      { status: 400 },
    );
  }

  // duration opcional (default 1); el bloque no puede pasar de medianoche.
  let dur = 1;
  if (duration !== undefined) {
    if (!isHalfStep(duration) || duration < 0.5) {
      return Response.json(
        { error: "duration inválida (>=0.5, pasos de 0.5)" },
        { status: 400 },
      );
    }
    dur = duration;
  }
  if (hour + dur > 24) {
    return Response.json(
      { error: "El bloque se pasa de medianoche (hour + duration > 24)" },
      { status: 400 },
    );
  }

  // La tarea debe existir (además el FK lo garantizaría, pero damos 404 claro).
  const [todo] = await db.select().from(todos).where(eq(todos.id, todoId));
  if (!todo) {
    return Response.json({ error: "Tarea no encontrada" }, { status: 404 });
  }

  const [created] = await db
    .insert(scheduleBlocks)
    .values({ todoId, date, hour, duration: dur })
    .returning();

  return Response.json(
    {
      id: created.id,
      todoId: created.todoId,
      date: created.date,
      hour: created.hour,
      duration: created.duration,
      status: created.status,
      title: todo.title,
      priority: todo.priority,
    },
    { status: 201 },
  );
}
