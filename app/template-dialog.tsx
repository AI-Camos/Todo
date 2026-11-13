"use client";

import { useEffect, useState } from "react";

// Diálogo para aplicar un día modelo sobre una fecha del calendario. Se abre
// desde los dos lados, así que uno de los dos extremos viene fijado:
//  - desde la Semana:      `date` fijo → eliges qué plantilla aplicar (y
//                          además puedes guardar ese día como plantilla nueva).
//  - desde Días modelo:    `templateId` fijo → eliges a qué fecha.

export type DayTemplate = { id: number; name: string };
export type ApplyResult = {
  date: string;
  templateName: string;
  added: number;
  removed: number;
};

type Mode = "merge" | "replace";

const DOW = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTHS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

const pad = (n: number) => String(n).padStart(2, "0");
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
// 'YYYY-MM-DD' → "mié 12 nov" (en hora local, sin pasar por UTC).
export function fmtDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${DOW[date.getDay()]} ${d} ${MONTHS[m - 1]}`;
}

export default function TemplateDialog({
  date: fixedDate,
  templateId: fixedTemplateId,
  onApplied,
  onSaved,
  onClose,
}: {
  date?: string;
  templateId?: number;
  onApplied: (r: ApplyResult) => void;
  onSaved?: (t: DayTemplate) => void;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<DayTemplate[] | null>(null);
  const [templateId, setTemplateId] = useState<number | null>(
    fixedTemplateId ?? null,
  );
  const [date, setDate] = useState(fixedDate ?? todayISO());
  const [mode, setMode] = useState<Mode>("merge");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/day-templates");
        if (!res.ok) throw new Error();
        const list = (await res.json()) as DayTemplate[];
        setTemplates(list);
        setTemplateId((id) => id ?? list[0]?.id ?? null);
      } catch {
        setError("No se pudieron cargar los días modelo");
        setTemplates([]);
      }
    })();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const template = templates?.find((t) => t.id === templateId) ?? null;

  async function apply() {
    if (!template || !date) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/day-templates/${template.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, mode }),
      });
      if (!res.ok) throw new Error();
      const { added, removed } = (await res.json()) as {
        added: number;
        removed: number;
      };
      onApplied({ date, templateName: template.name, added, removed });
    } catch {
      setError("No se pudo aplicar la plantilla");
    } finally {
      setBusy(false);
    }
  }

  async function saveDay() {
    const n = name.trim();
    if (!n || !fixedDate) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/day-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, fromDate: fixedDate }),
      });
      if (!res.ok) throw new Error();
      const created = (await res.json()) as DayTemplate;
      setTemplates((ts) => [...(ts ?? []), created]);
      setName("");
      onSaved?.(created);
    } catch {
      setError("No se pudo guardar el día como plantilla");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {fixedDate
            ? `Día modelo para el ${fmtDay(fixedDate)}`
            : `Aplicar «${template?.name ?? "…"}»`}
        </p>

        {templates === null ? (
          <p className="text-sm text-zinc-500">cargando…</p>
        ) : (
          <>
            {fixedDate ? (
              templates.length === 0 ? (
                <p className="mb-3 text-sm text-zinc-500">
                  Aún no tienes días modelo. Guarda este día como el primero
                  abajo, o créalos en la pestaña «Días modelo».
                </p>
              ) : (
                <label className="mb-3 flex items-center justify-between gap-2 text-sm">
                  <span className="text-xs font-medium text-zinc-500">Plantilla</span>
                  <select
                    value={templateId ?? ""}
                    onChange={(e) => setTemplateId(Number(e.target.value))}
                    className={`min-w-0 flex-1 ${input}`}
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              )
            ) : (
              <label className="mb-3 flex items-center justify-between gap-2 text-sm">
                <span className="text-xs font-medium text-zinc-500">Día</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={input}
                />
              </label>
            )}

            {template && (
              <>
                {/* Añadir es el modo por defecto: no destruye nada. Reemplazar
                    vacía el día primero, por eso se dice explícitamente. */}
                <fieldset className="mb-3 flex flex-col gap-1 text-sm">
                  {(
                    [
                      ["merge", "Añadir a lo que ya haya ese día"],
                      ["replace", "Reemplazar el día (borra sus bloques)"],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <input
                        type="radio"
                        name="mode"
                        checked={mode === value}
                        onChange={() => setMode(value)}
                      />
                      <span
                        className={
                          value === "replace"
                            ? "text-red-600 dark:text-red-400"
                            : "text-zinc-700 dark:text-zinc-200"
                        }
                      >
                        {label}
                      </span>
                    </label>
                  ))}
                </fieldset>
                <button
                  onClick={apply}
                  disabled={busy || !date}
                  className="w-full rounded-lg bg-zinc-900 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  Aplicar {fixedDate ? "" : `al ${date ? fmtDay(date) : "…"}`}
                </button>
              </>
            )}

            {/* Camino inverso: has dejado un día bien planificado y quieres
                reutilizarlo. Solo tiene sentido desde una fecha concreta. */}
            {fixedDate && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveDay();
                }}
                className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800"
              >
                <p className="mb-2 text-xs font-medium text-zinc-500">
                  Guardar este día como día modelo
                </p>
                <div className="flex gap-2">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="p. ej. Día con reuniones"
                    className={`min-w-0 flex-1 ${input}`}
                  />
                  <button
                    type="submit"
                    disabled={busy || !name.trim()}
                    className="rounded-lg border border-zinc-300 px-3 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Guardar
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          onClick={onClose}
          className="mt-3 w-full rounded-lg border border-zinc-300 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
