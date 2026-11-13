import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dayTemplates, scheduleBlocks, templateBlocks } from "@/lib/db/schema";
import { DATE_RE, isPositiveInt } from "@/lib/schedule-rules";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

// POST /api/day-templates/:id/apply — { date, mode: "merge" | "replace" }.
// Copia los bloques de la plantilla al día `date` del calendario.
//  - merge:   se añaden a lo que ya haya ese día.
//  - replace: primero se vacía el día (borra sus bloques) y luego se copia.
// Todo en una transacción: un "replace" a medias dejaría el día vacío.
export async function POST(request: NextRequest, { params }: Context) {
  const id = Number((await params).id);
  if (!isPositiveInt(id)) {
    return Response.json({ error: "id inválido" }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { date, mode = "merge" } = body as Record<string, unknown>;
  if (typeof date !== "string" || !DATE_RE.test(date)) {
    return Response.json({ error: "date inválida (YYYY-MM-DD)" }, { status: 400 });
  }
  if (mode !== "merge" && mode !== "replace") {
    return Response.json(
      { error: 'mode inválido ("merge" o "replace")' },
      { status: 400 },
    );
  }

  const [tpl] = await db
    .select()
    .from(dayTemplates)
    .where(eq(dayTemplates.id, id));
  if (!tpl) {
    return Response.json({ error: "Plantilla no encontrada" }, { status: 404 });
  }

  const result = await db.transaction(async (tx) => {
    const src = await tx
      .select()
      .from(templateBlocks)
      .where(eq(templateBlocks.templateId, id));
    const removed =
      mode === "replace"
        ? (
            await tx
              .delete(scheduleBlocks)
              .where(eq(scheduleBlocks.date, date))
              .returning({ id: scheduleBlocks.id })
          ).length
        : 0;
    if (src.length > 0) {
      await tx.insert(scheduleBlocks).values(
        src.map((b) => ({
          todoId: b.todoId,
          subtaskId: b.subtaskId,
          date,
          hour: b.hour,
          duration: b.duration,
        })),
      );
    }
    return { added: src.length, removed };
  });

  return Response.json(result);
}
