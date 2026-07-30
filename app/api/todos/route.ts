import type { NextRequest } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { todos, todoPriority } from "@/lib/db/schema";
import type { TodoPriority } from "@/lib/db/schema";
import { isTaskColor, type TaskColor } from "@/lib/colors";

const PRIORITIES = todoPriority.enumValues as readonly string[];

// pg/drizzle requieren runtime Node (no edge).
export const runtime = "nodejs";

// GET /api/todos — lista las tareas, más recientes primero.
export async function GET() {
  const rows = await db.select().from(todos).orderBy(desc(todos.createdAt));
  return Response.json(rows);
}

// POST /api/todos — crea una tarea a partir de { title }.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const rawTitle = (body as Record<string, unknown>).title;
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  if (!title) {
    return Response.json({ error: "El título es obligatorio" }, { status: 400 });
  }

  const rawPriority = (body as Record<string, unknown>).priority;
  let priority: TodoPriority | undefined;
  if (rawPriority !== undefined) {
    if (typeof rawPriority !== "string" || !PRIORITIES.includes(rawPriority)) {
      return Response.json({ error: "priority inválido" }, { status: 400 });
    }
    priority = rawPriority as TodoPriority;
  }

  // `color` es opcional: si no viene, queda null y la UI deriva uno del id.
  const rawColor = (body as Record<string, unknown>).color;
  let color: TaskColor | undefined;
  if (rawColor !== undefined && rawColor !== null) {
    if (!isTaskColor(rawColor)) {
      return Response.json({ error: "color inválido" }, { status: 400 });
    }
    color = rawColor;
  }

  const [created] = await db
    .insert(todos)
    .values({ title, ...(priority ? { priority } : {}), ...(color ? { color } : {}) })
    .returning();
  return Response.json(created, { status: 201 });
}
