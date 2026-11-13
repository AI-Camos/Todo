"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import TimeGrid, { type GridColumn } from "@/app/time-grid";
import TemplateDialog, { fmtDay, type DayTemplate } from "@/app/template-dialog";

// Días modelo: la misma cuadrícula que la Semana, pero cada columna es una
// plantilla en vez de una fecha. Así se diseñan con las mismas herramientas
// (arrastrar entre plantillas, copiar/pegar, subtareas…) y se comparan lado a
// lado. Aplicar una a un día COPIA sus bloques: editarla luego no toca los
// días ya aplicados.

const SUGGESTIONS = ["Día con reuniones", "Día sin reuniones", "Fin de semana"];

const smallBtn =
  "rounded px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100";

export default function TemplatesBoard() {
  const [templates, setTemplates] = useState<DayTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(
    null,
  );
  const [applyId, setApplyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/day-templates");
        if (!res.ok) throw new Error();
        setTemplates((await res.json()) as DayTemplate[]);
      } catch {
        setError("No se pudieron cargar los días modelo");
        setTemplates([]);
      }
    })();
  }, []);

  // Las columnas son la lista de plantillas: desplazar = moverse por índice, y
  // más allá de la primera/última no hay nada (null).
  const ids = (templates ?? []).map((t) => String(t.id));
  const idsKey = ids.join(",");
  const shiftCol = useCallback(
    (col: string, n: number) => {
      const list = idsKey.split(",");
      const i = list.indexOf(col);
      return i === -1 ? null : (list[i + n] ?? null);
    },
    [idsKey],
  );
  const colDelta = useCallback(
    (a: string, b: string) => {
      const list = idsKey.split(",");
      return list.indexOf(b) - list.indexOf(a);
    },
    [idsKey],
  );

  async function create(name: string) {
    const n = name.trim();
    if (!n) return;
    setError(null);
    try {
      const res = await fetch("/api/day-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n }),
      });
      if (!res.ok) throw new Error();
      const created = (await res.json()) as DayTemplate;
      setTemplates((ts) => [...(ts ?? []), created]);
      setNewName("");
    } catch {
      setError("No se pudo crear el día modelo");
    }
  }

  async function rename(id: number, name: string) {
    setRenaming(null);
    const n = name.trim();
    const prev = templates;
    if (!n || prev?.find((t) => t.id === id)?.name === n) return;
    setTemplates((ts) => ts?.map((t) => (t.id === id ? { ...t, name: n } : t)) ?? ts);
    try {
      const res = await fetch(`/api/day-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setTemplates(prev);
      setError("No se pudo renombrar");
    }
  }

  async function remove(t: DayTemplate) {
    if (!confirm(`¿Borrar el día modelo «${t.name}»? Los días a los que ya lo aplicaste no cambian.`)) {
      return;
    }
    const prev = templates;
    setTemplates((ts) => ts?.filter((x) => x.id !== t.id) ?? ts);
    try {
      const res = await fetch(`/api/day-templates/${t.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error();
    } catch {
      setTemplates(prev);
      setError("No se pudo borrar");
    }
  }

  const newForm = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create(newName);
      }}
      className="flex gap-2"
    >
      <input
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        placeholder="Nuevo día modelo…"
        className="w-52 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
      />
      <button
        type="submit"
        disabled={!newName.trim()}
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        + Crear
      </button>
    </form>
  );

  if (templates === null) {
    return <p className="text-sm text-zinc-400">cargando…</p>;
  }

  const columns: GridColumn[] = templates.map((t) => ({
    key: String(t.id),
    label: t.name,
  }));

  return (
    <div>
      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
          <span>
            {notice.text} ·{" "}
            <Link href="/semana" className="underline">
              ver la semana
            </Link>
          </span>
          <button onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100">
            ×
          </button>
        </p>
      )}

      {templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="mb-1 font-medium text-zinc-700 dark:text-zinc-200">
            Aún no tienes días modelo
          </p>
          <p className="mb-4 text-sm text-zinc-500">
            Crea uno por cada tipo de día que sueles tener. Por ejemplo:
          </p>
          <div className="mb-4 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => create(s)}
                className="rounded-full border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                + {s}
              </button>
            ))}
          </div>
          <div className="flex justify-center">{newForm}</div>
        </div>
      ) : (
        <TimeGrid
          columns={columns}
          url="/api/template-blocks"
          colField="templateId"
          shiftCol={shiftCol}
          colDelta={colDelta}
          removeLabel="Quitar de la plantilla"
          hint="clic en un hueco para añadir · Ctrl/⌘+clic para seleccionar varios · arrastra entre plantillas · Ctrl+C / Ctrl+V para copiar"
          toolbar={newForm}
          headerExtra={(c) => {
            const t = templates.find((x) => String(x.id) === c.key)!;
            if (renaming?.id === t.id) {
              return (
                <input
                  autoFocus
                  value={renaming.name}
                  onChange={(e) => setRenaming({ id: t.id, name: e.target.value })}
                  onBlur={() => rename(t.id, renaming.name)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") rename(t.id, renaming.name);
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  className="mt-1 w-full rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
                />
              );
            }
            return (
              <div className="mt-1 flex justify-center gap-0.5">
                <button onClick={() => setApplyId(t.id)} className={`${smallBtn} font-medium`}>
                  Aplicar a…
                </button>
                <button
                  onClick={() => setRenaming({ id: t.id, name: t.name })}
                  title="Renombrar"
                  className={smallBtn}
                >
                  ✎
                </button>
                <button
                  onClick={() => remove(t)}
                  title="Borrar día modelo"
                  className={`${smallBtn} hover:text-red-600 dark:hover:text-red-400`}
                >
                  ×
                </button>
              </div>
            );
          }}
        />
      )}

      {applyId !== null && (
        <TemplateDialog
          templateId={applyId}
          onApplied={({ date, templateName, added, removed }) => {
            setApplyId(null);
            setNotice({
              text:
                `«${templateName}» aplicado al ${fmtDay(date)}: ${added} bloque${added === 1 ? "" : "s"}` +
                (removed ? ` (se quitaron ${removed} que había)` : ""),
            });
          }}
          onClose={() => setApplyId(null)}
        />
      )}
    </div>
  );
}
