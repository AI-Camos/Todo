import type { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { subtasks, todos } from "@/lib/db/schema";

// pg/drizzle requieren runtime Node (no edge).
export const runtime = "nodejs";

// GET /api/subtasks[?todoId=N] — subtareas, opcionalmente las de una tarea.
// Sin filtro devuelve todas: son un título por fila y la UI (tablero y
// calendario) las necesita todas a la vez; pedirlas por tarea sería un N+1.
export async function GET(request: NextRequest) {
  const raw = new URL(request.url).searchParams.get("todoId");

  let where;
  if (raw !== null) {
    const todoId = Number(raw);
    if (!Number.isInteger(todoId) || todoId <= 0) {
      return Response.json({ error: "todoId inválido" }, { status: 400 });
    }
    where = eq(subtasks.todoId, todoId);
  }

  const rows = await db
    .select()
    .from(subtasks)
    .where(where)
    .orderBy(asc(subtasks.todoId), asc(subtasks.id));

  return Response.json(rows);
}

// POST /api/subtasks — crea una subtarea: { todoId, title }.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { todoId, title: rawTitle } = body as Record<string, unknown>;

  if (typeof todoId !== "number" || !Number.isInteger(todoId) || todoId <= 0) {
    return Response.json({ error: "todoId inválido" }, { status: 400 });
  }
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  if (!title) {
    return Response.json({ error: "El título es obligatorio" }, { status: 400 });
  }

  // El FK lo garantizaría, pero así damos un 404 claro en vez de un 500.
  const [todo] = await db.select().from(todos).where(eq(todos.id, todoId));
  if (!todo) {
    return Response.json({ error: "Tarea no encontrada" }, { status: 404 });
  }

  const [created] = await db.insert(subtasks).values({ todoId, title }).returning();
  return Response.json(created, { status: 201 });
}
