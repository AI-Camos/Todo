"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "todo" | "doing" | "paused" | "done";
type Priority = "low" | "medium" | "high";

type Todo = {
  id: number;
  title: string;
  status: Status;
  priority: Priority;
  createdAt: string;
};

type Block = {
  id: number;
  todoId: number;
  date: string; // YYYY-MM-DD
  hour: number;
  duration: number; // horas que ocupa (>=1)
  status: Status;
  title: string;
  priority: Priority;
};

const START_HOUR = 6;
const END_HOUR = 23;
const HOURS = Array.from(
  { length: END_HOUR - START_HOUR + 1 },
  (_, i) => START_HOUR + i,
); // 6..23
const ROW_H = 48; // px por hora
const BODY_H = HOURS.length * ROW_H;

const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];
const STATUSES: Status[] = ["todo", "doing", "paused", "done"];

const STATUS_UI: Record<
  Status,
  { label: string; dot: string; block: string }
> = {
  todo: {
    label: "Por hacer",
    dot: "bg-zinc-400",
    block:
      "border-l-zinc-400 bg-zinc-100 text-zinc-700 dark:bg-zinc-700/70 dark:text-zinc-100",
  },
  doing: {
    label: "En progreso",
    dot: "bg-blue-500",
    block:
      "border-l-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-100",
  },
  paused: {
    label: "En pausa",
    dot: "bg-amber-500",
    block:
      "border-l-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-100",
  },
  done: {
    label: "Hecho",
    dot: "bg-emerald-500",
    block:
      "border-l-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-100",
  },
};

const pad = (n: number) => String(n).padStart(2, "0");

// --- helpers de fecha (en hora local, trabajando con 'YYYY-MM-DD') ---
function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function mondayOf(d: Date): Date {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // 0=Lun .. 6=Dom
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Reparte los bloques de un día en carriles para que los solapes no se pisen.
function layoutDay(dayBlocks: Block[]): { placed: { block: Block; lane: number }[]; lanes: number } {
  const sorted = [...dayBlocks].sort(
    (a, b) => a.hour - b.hour || b.duration - a.duration || a.id - b.id,
  );
  const laneEnds: number[] = []; // hora de fin del último bloque de cada carril
  const placed = sorted.map((block) => {
    let lane = laneEnds.findIndex((end) => end <= block.hour);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(block.hour + block.duration);
    } else {
      laneEnds[lane] = block.hour + block.duration;
    }
    return { block, lane };
  });
  return { placed, lanes: Math.max(1, laneEnds.length) };
}

export default function WeekCalendar() {
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [todos, setTodos] = useState<Todo[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ date: string; hour: number } | null>(
    null,
  );
  const [statusFor, setStatusFor] = useState<Block | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const todayISO = toISO(new Date());
  const weekHasToday = days.some((d) => toISO(d) === todayISO);

  // Carga tareas una vez (para el selector).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/todos");
        if (!res.ok) throw new Error("No se pudieron cargar las tareas");
        setTodos((await res.json()) as Todo[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
  }, []);

  // Carga los bloques de la semana visible (y recarga al navegar).
  useEffect(() => {
    const start = toISO(days[0]);
    const end = toISO(days[6]);
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/schedule?start=${start}&end=${end}`);
        if (!res.ok) throw new Error("No se pudo cargar el calendario");
        setBlocks((await res.json()) as Block[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    })();
  }, [days]);

  // Tic cada minuto para mover la barra de "ahora".
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Agrupa por fecha.
  const byDate = useMemo(() => {
    const map = new Map<string, Block[]>();
    for (const b of blocks) {
      const arr = map.get(b.date);
      if (arr) arr.push(b);
      else map.set(b.date, [b]);
    }
    return map;
  }, [blocks]);

  // Posición de la barra de "ahora" (px desde el inicio del cuerpo).
  const nowInfo = useMemo(() => {
    void nowTick;
    const d = new Date();
    const h = d.getHours();
    if (!weekHasToday || h < START_HOUR || h > END_HOUR) return null;
    const top = (h - START_HOUR + d.getMinutes() / 60) * ROW_H;
    return { top, label: `${pad(h)}:${pad(d.getMinutes())}` };
  }, [nowTick, weekHasToday]);

  async function addBlock(
    todoId: number,
    date: string,
    hour: number,
    duration: number,
  ) {
    setPicker(null);
    setError(null);
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ todoId, date, hour, duration }),
      });
      if (!res.ok) throw new Error("No se pudo añadir el bloque");
      const created = (await res.json()) as Block;
      setBlocks((prev) => [...prev, created]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    }
  }

  // Update optimista genérico de un bloque (status o duration).
  async function patchBlock(block: Block, updates: Partial<Block>) {
    const prev = blocks;
    setBlocks((bs) => bs.map((b) => (b.id === block.id ? { ...b, ...updates } : b)));
    setError(null);
    try {
      const res = await fetch(`/api/schedule/${block.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("No se pudo actualizar el bloque");
      const updated = (await res.json()) as Block;
      setBlocks((bs) =>
        bs.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)),
      );
    } catch (e) {
      setBlocks(prev);
      setError(e instanceof Error ? e.message : "Error desconocido");
    }
  }

  async function removeBlock(id: number) {
    setStatusFor(null);
    const prev = blocks;
    setBlocks((bs) => bs.filter((b) => b.id !== id));
    setError(null);
    try {
      const res = await fetch(`/api/schedule/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("No se pudo quitar el bloque");
    } catch (e) {
      setBlocks(prev);
      setError(e instanceof Error ? e.message : "Error desconocido");
    }
  }

  const rangeLabel = `${days[0].getDate()} ${MONTHS[days[0].getMonth()]} – ${days[6].getDate()} ${MONTHS[days[6].getMonth()]}`;

  return (
    <div>
      {/* Barra de navegación de semana */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setWeekStart((w) => addDays(w, -7))}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          ← Anterior
        </button>
        <button
          onClick={() => setWeekStart(mondayOf(new Date()))}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Hoy
        </button>
        <button
          onClick={() => setWeekStart((w) => addDays(w, 7))}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Siguiente →
        </button>
        <span className="ml-1 text-sm font-medium text-zinc-600 dark:text-zinc-300">
          {rangeLabel}
        </span>
        {loading && <span className="text-xs text-zinc-400">cargando…</span>}
      </div>

      {/* Leyenda de estados */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        {STATUSES.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${STATUS_UI[s].dot}`} />
            {STATUS_UI[s].label}
          </span>
        ))}
        <span className="text-zinc-400">· clic en un bloque para cambiar estado/duración</span>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </p>
      )}

      {/* Cuadrícula del calendario */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="min-w-[760px]">
          {/* Cabecera de días */}
          <div className="grid grid-cols-[3.5rem_repeat(7,1fr)] border-b border-zinc-200 bg-zinc-50 text-sm dark:border-zinc-800 dark:bg-zinc-900/60">
            <div className="px-2 py-2" />
            {days.map((d, i) => {
              const iso = toISO(d);
              const isToday = iso === todayISO;
              return (
                <div
                  key={iso}
                  className={`border-l border-zinc-200 px-2 py-2 text-center dark:border-zinc-800 ${
                    isToday ? "bg-zinc-900/5 dark:bg-white/5" : ""
                  }`}
                >
                  <div className="font-medium text-zinc-700 dark:text-zinc-200">
                    {DOW[i]}
                  </div>
                  <div
                    className={`text-xs ${isToday ? "font-semibold text-red-500" : "text-zinc-400"}`}
                  >
                    {d.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cuerpo: rejilla con columnas por día y bloques posicionados */}
          <div
            className="relative grid grid-cols-[3.5rem_repeat(7,1fr)]"
            style={{ height: BODY_H }}
          >
            {/* Columna de horas (gutter) */}
            <div className="relative">
              {HOURS.map((hour, i) => (
                <div
                  key={hour}
                  style={{ top: i * ROW_H }}
                  className="absolute right-2 -translate-y-1/2 text-xs tabular-nums text-zinc-400"
                >
                  {i === 0 ? "" : `${pad(hour)}:00`}
                </div>
              ))}
            </div>

            {/* Columnas de días */}
            {days.map((d) => {
              const iso = toISO(d);
              const isToday = iso === todayISO;
              const { placed, lanes } = layoutDay(byDate.get(iso) ?? []);
              return (
                <div
                  key={iso}
                  className={`relative border-l border-zinc-200 dark:border-zinc-800 ${
                    isToday ? "bg-zinc-900/[0.02] dark:bg-white/[0.03]" : ""
                  }`}
                >
                  {/* Ranuras de fondo (líneas de hora + añadir) */}
                  {HOURS.map((hour, i) => (
                    <button
                      key={hour}
                      onClick={() => setPicker({ date: iso, hour })}
                      aria-label={`Añadir tarea el ${iso} a las ${hour}:00`}
                      style={{ top: i * ROW_H, height: ROW_H }}
                      className="group/slot absolute inset-x-0 border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800/70 dark:hover:bg-zinc-800/40"
                    >
                      <span className="text-xs text-zinc-300 opacity-0 transition group-hover/slot:opacity-100 dark:text-zinc-600">
                        +
                      </span>
                    </button>
                  ))}

                  {/* Bloques */}
                  {placed.map(({ block, lane }) => {
                    const top = (block.hour - START_HOUR) * ROW_H;
                    const height = block.duration * ROW_H;
                    const w = 100 / lanes;
                    const ui = STATUS_UI[block.status];
                    return (
                      <button
                        key={block.id}
                        onClick={() => setStatusFor(block)}
                        title={`${block.title} — ${ui.label} · ${pad(block.hour)}:00–${pad(block.hour + block.duration)}:00`}
                        style={{
                          top: top + 1,
                          height: height - 2,
                          left: `calc(${lane * w}% + 2px)`,
                          width: `calc(${w}% - 4px)`,
                        }}
                        className={`absolute z-10 flex flex-col overflow-hidden rounded border-l-2 px-1.5 py-1 text-left text-xs transition-shadow hover:shadow-md ${ui.block}`}
                      >
                        <span
                          className={`truncate font-medium ${block.status === "done" ? "line-through" : ""}`}
                        >
                          {block.title}
                        </span>
                        {block.duration > 1 && (
                          <span className="mt-auto text-[10px] tabular-nums opacity-70">
                            {pad(block.hour)}:00–{pad(block.hour + block.duration)}:00
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {/* Barra de "ahora" recorriendo el tablero */}
            {nowInfo && (
              <div
                className="pointer-events-none absolute left-14 right-0 z-20 flex items-center"
                style={{ top: nowInfo.top }}
              >
                <span className="absolute -left-14 w-14 pr-1 text-right text-[10px] font-medium tabular-nums text-red-500">
                  {nowInfo.label}
                </span>
                <span className="size-2 shrink-0 rounded-full bg-red-500" />
                <span className="h-px flex-1 bg-red-500" />
              </div>
            )}
          </div>
        </div>
      </div>

      {picker && (
        <TaskPicker
          todos={todos}
          date={picker.date}
          hour={picker.hour}
          onPick={(todoId, duration) =>
            addBlock(todoId, picker.date, picker.hour, duration)
          }
          onClose={() => setPicker(null)}
        />
      )}

      {statusFor && (
        <StatusModal
          block={statusFor}
          onStatus={(status) => {
            setStatusFor(null);
            if (status !== statusFor.status) patchBlock(statusFor, { status });
          }}
          onDuration={(duration) => {
            if (duration !== statusFor.duration) patchBlock(statusFor, { duration });
            setStatusFor((s) => (s ? { ...s, duration } : s));
          }}
          onRemove={() => removeBlock(statusFor.id)}
          onClose={() => setStatusFor(null)}
        />
      )}
    </div>
  );
}

const PRIORITY_DOT: Record<Priority, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-zinc-400",
};

// Modal para cambiar estado y duración de un bloque (estilo Clockify).
function StatusModal({
  block,
  onStatus,
  onDuration,
  onRemove,
  onClose,
}: {
  block: Block;
  onStatus: (status: Status) => void;
  onDuration: (duration: number) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const maxDuration = 24 - block.hour;
  const durationOptions = Array.from({ length: maxDuration }, (_, i) => i + 1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {block.title}
        </p>
        <p className="mb-3 text-xs text-zinc-500">
          {block.date} · {pad(block.hour)}:00–{pad(block.hour + block.duration)}:00
        </p>

        <p className="mb-1 text-xs font-medium text-zinc-500">Estado</p>
        <div className="mb-3 flex flex-col gap-1">
          {STATUSES.map((s) => {
            const active = s === block.status;
            return (
              <button
                key={s}
                onClick={() => onStatus(s)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  active
                    ? "bg-zinc-100 font-medium dark:bg-zinc-800"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <span className={`size-2.5 rounded-full ${STATUS_UI[s].dot}`} />
                <span className="text-zinc-800 dark:text-zinc-100">
                  {STATUS_UI[s].label}
                </span>
                {active && (
                  <span className="ml-auto text-xs text-zinc-400">actual</span>
                )}
              </button>
            );
          })}
        </div>

        <label className="mb-3 flex items-center justify-between gap-2 text-sm">
          <span className="text-xs font-medium text-zinc-500">Duración</span>
          <select
            value={block.duration}
            onChange={(e) => onDuration(Number(e.target.value))}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
          >
            {durationOptions.map((h) => (
              <option key={h} value={h}>
                {h} {h === 1 ? "hora" : "horas"}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={onRemove}
          className="w-full rounded-lg border border-red-200 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/50"
        >
          Quitar del calendario
        </button>
      </div>
    </div>
  );
}

function TaskPicker({
  todos,
  date,
  hour,
  onPick,
  onClose,
}: {
  todos: Todo[];
  date: string;
  hour: number;
  onPick: (todoId: number, duration: number) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [duration, setDuration] = useState(1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const maxDuration = 24 - hour;
  const durationOptions = Array.from({ length: maxDuration }, (_, i) => i + 1);
  const filtered = todos.filter((t) =>
    t.title.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
          Añadir tarea · {date} a las {pad(hour)}:00
        </p>

        <label className="mb-2 flex items-center justify-between gap-2 text-sm">
          <span className="text-xs font-medium text-zinc-500">Duración</span>
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
          >
            {durationOptions.map((h) => (
              <option key={h} value={h}>
                {h} {h === 1 ? "hora" : "horas"}
              </option>
            ))}
          </select>
        </label>

        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar tarea…"
          className="mb-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
        />
        <div className="max-h-64 overflow-y-auto">
          {todos.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-zinc-500">
              No tienes tareas todavía. Créalas en el{" "}
              <a href="/" className="underline">
                tablero
              </a>
              .
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-zinc-500">
              Sin coincidencias.
            </p>
          ) : (
            <ul className="flex flex-col">
              {filtered.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => onPick(t.id, duration)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <span className={`size-2 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`} />
                    <span className="truncate text-zinc-800 dark:text-zinc-100">
                      {t.title}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          onClick={onClose}
          className="mt-2 w-full rounded-lg border border-zinc-300 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
