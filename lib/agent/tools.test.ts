import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { todos } from "@/lib/db/schema";
import { consultarTareas, crearTarea } from "./tools";

// run() puede devolver string o bloques de contenido; nuestras tools de datos
// siempre devuelven texto. Este helper lo estrecha a string y falla si no.
async function texto(
  r: string | Array<unknown> | Promise<string | Array<unknown>>,
): Promise<string> {
  const v = await r;
  if (typeof v !== "string") throw new Error("se esperaba texto de la tool");
  return v;
}

// DATABASE_URL la carga vitest.setup.ts antes de importar este módulo.

// Cada test siembra tareas y las borra al final, para no ensuciar la BD real.
// No es la transacción-por-caso ideal (el pool de Drizzle no lo pone fácil),
// pero el afterEach deja la tabla como estaba.
const sembradas: number[] = [];

async function sembrar(
  title: string,
  status: "todo" | "doing" | "paused" | "done",
  priority: "low" | "medium" | "high",
) {
  const [row] = await db
    .insert(todos)
    .values({ title, status, priority })
    .returning();
  sembradas.push(row.id);
  return row;
}

describe("consultar_tareas", () => {
  beforeAll(async () => {
    // Falla rápido y claro si la BD no está levantada.
    await db.execute(sql`select 1`);
  });

  afterEach(async () => {
    if (sembradas.length) {
      await db.delete(todos).where(
        sql`${todos.id} in (${sql.join(
          sembradas.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
      sembradas.length = 0;
    }
  });

  it("filtra por estado y prioridad", async () => {
    await sembrar("informe trimestral", "todo", "high");
    await sembrar("regar plantas", "todo", "low");
    await sembrar("ya hecho", "done", "high");

    const soloAltas = await texto(
      consultarTareas.run({ status: "todo", priority: "high", limit: 10 }),
    );

    expect(soloAltas).toContain("informe trimestral");
    expect(soloAltas).not.toContain("regar plantas"); // prioridad low
    expect(soloAltas).not.toContain("ya hecho"); // estado done
    expect(soloAltas).toContain("estado=todo, prioridad=high");
  });

  it("respeta el limit", async () => {
    for (let i = 0; i < 5; i++) await sembrar(`t${i}`, "todo", "medium");

    const dos = await texto(consultarTareas.run({ limit: 2 }));
    const lineas = dos.split("\n").filter((l: string) => l.startsWith("#"));
    expect(lineas).toHaveLength(2);
  });

  it("mensaje claro cuando no hay nada", async () => {
    const vacio = await texto(
      consultarTareas.run({ status: "paused", limit: 10 }),
    );
    expect(vacio).toContain("ninguna");
  });
});

// Extrae el id de un "Creada la tarea #42: ..." para poder limpiar y verificar.
function idDe(msg: string): number {
  const m = msg.match(/#(\d+)/);
  if (!m) throw new Error(`sin id en el mensaje: ${msg}`);
  return Number(m[1]);
}

describe("crear_tarea", () => {
  beforeAll(async () => {
    await db.execute(sql`select 1`);
  });

  afterEach(async () => {
    if (sembradas.length) {
      await db.delete(todos).where(
        sql`${todos.id} in (${sql.join(
          sembradas.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
      sembradas.length = 0;
    }
  });

  it("crea la tarea y la persiste en 'todo'", async () => {
    const msg = await texto(
      crearTarea.run({ title: "escribir el informe", priority: "high" }),
    );
    const id = idDe(msg);
    sembradas.push(id);

    // No basta con el texto de vuelta: comprobamos que existe en la BD.
    const [row] = await db.select().from(todos).where(eq(todos.id, id));
    expect(row.title).toBe("escribir el informe");
    expect(row.priority).toBe("high");
    expect(row.status).toBe("todo");
  });

  it("prioridad por defecto = medium cuando no se indica", async () => {
    // El camino real: el runner hace parse() (aplica el default) y luego run().
    const args = crearTarea.parse({ title: "comprar leche" });
    expect(args.priority).toBe("medium"); // el default lo pone parse, no run
    const msg = await texto(crearTarea.run(args));
    const id = idDe(msg);
    sembradas.push(id);

    const [row] = await db.select().from(todos).where(eq(todos.id, id));
    expect(row.priority).toBe("medium");
  });

  it("rechaza título vacío (validación Zod)", async () => {
    // El runner llama a parse() antes de run(); un título vacío debe fallar ahí.
    expect(() => crearTarea.parse({ title: "   " })).toThrow();
  });
});
