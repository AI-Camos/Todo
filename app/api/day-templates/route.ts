import type { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dayTemplates, scheduleBlocks, templateBlocks } from "@/lib/db/schema";
import { DATE_RE } from "@/lib/schedule-rules";

export const runtime = "nodejs";

// GET /api/day-templates — lista de días modelo (sin bloques: esos van por
// /api/template-blocks, todos de una vez).
export async function GET() {
  const rows = await db
    .select({ id: dayTemplates.id, name: dayTemplates.name })
    .from(dayTemplates)
    .orderBy(asc(dayTemplates.id));
  return Response.json(rows);
}

// POST /api/day-templates — { name, fromDate? }. Con `fromDate` la plantilla
// nace como copia de ese día del calendario («guardar este día como modelo»).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { name: rawName, fromDate } = body as Record<string, unknown>;
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name) {
    return Response.json({ error: "Falta el nombre" }, { status: 400 });
  }
  if (
    fromDate !== undefined &&
    (typeof fromDate !== "string" || !DATE_RE.test(fromDate))
  ) {
    return Response.json({ error: "fromDate inválida (YYYY-MM-DD)" }, { status: 400 });
  }

  const created = await db.transaction(async (tx) => {
    const [tpl] = await tx.insert(dayTemplates).values({ name }).returning();
    if (typeof fromDate === "string") {
      const src = await tx
        .select()
        .from(scheduleBlocks)
        .where(eq(scheduleBlocks.date, fromDate));
      if (src.length > 0) {
        await tx.insert(templateBlocks).values(
          src.map((b) => ({
            templateId: tpl.id,
            todoId: b.todoId,
            subtaskId: b.subtaskId,
            hour: b.hour,
            duration: b.duration,
          })),
        );
      }
    }
    return tpl;
  });

  return Response.json({ id: created.id, name: created.name }, { status: 201 });
}
