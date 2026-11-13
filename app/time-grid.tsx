"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TASK_COLORS, resolveColor } from "@/lib/colors";

// Cuadrícula horaria genérica (time-blocking estilo Clockify). La usan dos
// vistas que son lo MISMO salvo por qué es una columna:
//  - /semana:     una columna = una fecha   (bloques en /api/schedule)
//  - /plantillas: una columna = un día modelo (bloques en /api/template-blocks)
// Todo lo demás (arrastrar, sombra de destino, copiar/pegar, selección
// múltiple, subtareas, medias horas) se comparte para que no diverjan.

type Status = "todo" | "doing" | "paused" | "done";
type Priority = "low" | "medium" | "high";

type Todo = {
  id: number;
  title: string;
  status: Status;
  priority: Priority;
  color: string | null;
  createdAt: string;
};

// Subtarea de una tarea: solo un título. Ver `subtasks` en lib/db/schema.ts.
type Subtask = {
  id: number;
  todoId: number;
  title: string;
};

type Block = {
  id: number;
  todoId: number;
  // Subtarea concreta de este bloque (null = la tarea a secas). Es lo que
  // permite partir el bloque de 8 h de "Trabajo" en 4 de 2 h sin que dejen de
  // ser "Trabajo": mismo `todoId`, mismo color, distinta subtarea.
  subtaskId: number | null;
  subtaskTitle: string | null;
  // Columna en la que vive: una fecha 'YYYY-MM-DD' o el id de una plantilla
  // (como string). Se traduce desde/hacia el campo real con `colField`.
  col: string;
  hour: number;
  duration: number; // horas que ocupa (>=0.5)
  status: Status | null; // null en plantillas: el plan no tiene estado
  title: string;
  priority: Priority;
  color: string | null; // clave de paleta de la TAREA (null = automático)
};

// Sombra de previsualización: dónde caería un bloque si soltases ahora mismo.
// No existe en la BD — es el bloque con la columna/hora de destino aplicadas.
type Ghost = {
  id: number; // id del bloque real que representa
  todoId: number;
  col: string;
  hour: number;
  duration: number;
  title: string;
  subtaskTitle: string | null;
  color: string | null;
};

// Item del portapapeles: la tarea + su desfase (columnas/horas) respecto al
// ancla del grupo copiado, para recolocar el grupo al pegar conservando su forma.
type ClipItem = {
  todoId: number;
  subtaskId: number | null;
  title: string;
  duration: number;
  colOffset: number;
  hourOffset: number;
};

export type GridColumn = {
  key: string; // fecha 'YYYY-MM-DD' o id de plantilla
  label: string;
  sub?: string;
  highlight?: boolean; // hoy
};

type Props = {
  columns: GridColumn[];
  // Colección REST de bloques: GET (con `query`), POST, y PATCH/DELETE en /:id.
  url: string;
  query?: string;
  // Campo del bloque que identifica la columna en la API.
  colField: "date" | "templateId";
  // Columna desplazada n posiciones (null = fuera de rango) y distancia entre
  // dos columnas. Para fechas se puede salir de la semana visible; para
  // plantillas no hay nada más allá de la última.
  shiftCol: (col: string, n: number) => string | null;
  colDelta: (from: string, to: string) => number;
  withStatus?: boolean;
  nowCol?: string | null; // columna donde pintar la barra de "ahora"
  refreshKey?: number; // cambiarlo fuerza a recargar los bloques
  toolbar?: ReactNode;
  headerExtra?: (col: GridColumn) => ReactNode;
  hint?: string;
  removeLabel?: string;
};

const START_HOUR = 5;
const END_HOUR = 23;
const STEP = 0.5; // granularidad: media hora
const HOURS = Array.from(
  { length: END_HOUR - START_HOUR + 1 },
  (_, i) => START_HOUR + i,
); // 5..23 (para etiquetas y líneas de hora)
// Ranuras de media hora para colocar/pegar: 5, 5.5, …, 23.5
const SLOTS = Array.from(
  { length: (END_HOUR - START_HOUR + 1) * 2 },
  (_, i) => START_HOUR + i * STEP,
);
const ROW_H = 48; // px por hora
const HALF_H = ROW_H * STEP; // px por media hora
const BODY_H = HOURS.length * ROW_H;

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

// El color del bloque es el de la TAREA (elegido en el tablero), no el del
// estado: con muchos bloques en la semana, todos del mismo gris eran
// indistinguibles. El estado pasa a ser un punto dentro del bloque.
const blockColor = (color: string | null, todoId: number) =>
  TASK_COLORS[resolveColor(color, todoId)].block;

const pad = (n: number) => String(n).padStart(2, "0");

// Formatea una hora fraccionaria (6.5 → "06:30").
const fmtTime = (h: number) => `${pad(Math.floor(h))}:${pad((h % 1) * 60)}`;

// Formatea una duración en horas fraccionarias (0.5 → "30 min", 1.5 → "1 h 30 min").
function fmtDuration(d: number): string {
  const h = Math.floor(d);
  const m = Math.round((d % 1) * 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

// Recorta el desfase de horas para que TODO el grupo quepa en el rango válido
// (nadie por debajo de START_HOUR ni pasándose de medianoche). Es pura y vive
// fuera del componente para poder usarla también al calcular la sombra de
// destino: la sombra tiene que enseñar la MISMA hora en la que va a caer el
// bloque, recorte incluido, o estaría mintiendo.
function clampHourDelta(
  group: { hour: number; duration: number }[],
  hourDelta: number,
): number {
  let lo = -Infinity;
  let hi = Infinity;
  for (const b of group) {
    lo = Math.max(lo, START_HOUR - b.hour); // no bajar de START_HOUR
    hi = Math.min(hi, 24 - b.duration - b.hour); // no pasar de medianoche
  }
  return Math.max(lo, Math.min(hourDelta, hi));
}

// Hora (encajada a la media hora) que corresponde a la Y del cursor dentro de
// una columna. La comparten el `dragOver` (sombra) y el `drop` (el movimiento
// de verdad): si divergieran, la sombra enseñaría otra cosa.
const hourFromY = (clientY: number, rect: DOMRect) =>
  START_HOUR + Math.floor((clientY - rect.top) / HALF_H) * STEP;

// Reparte los bloques de un día en carriles para que los solapes no se pisen.
// Los carriles se cuentan por GRUPO de bloques encadenados por solapes, no por
// día: si no, un solo solape estrecharía todos los bloques del día.
function layoutDay(
  dayBlocks: Block[],
): { block: Block; lane: number; lanes: number }[] {
  const sorted = [...dayBlocks].sort(
    (a, b) => a.hour - b.hour || b.duration - a.duration || a.id - b.id,
  );
  const placed: { block: Block; lane: number; lanes: number }[] = [];
  let group: typeof placed = [];
  let laneEnds: number[] = []; // hora de fin del último bloque de cada carril
  let groupEnd = -Infinity;
  const closeGroup = () => {
    for (const p of group) p.lanes = laneEnds.length;
    placed.push(...group);
    group = [];
    laneEnds = [];
  };
  for (const block of sorted) {
    // Empieza cuando todo lo anterior ya terminó: grupo nuevo.
    if (block.hour >= groupEnd) closeGroup();
    let lane = laneEnds.findIndex((end) => end <= block.hour);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(block.hour + block.duration);
    } else {
      laneEnds[lane] = block.hour + block.duration;
    }
    groupEnd = Math.max(groupEnd, block.hour + block.duration);
    group.push({ block, lane, lanes: 1 });
  }
  closeGroup();
  return placed;
}

// Fila de la API → Block (la columna sale de `date` o de `templateId`).
function toBlock(raw: Record<string, unknown>, colField: Props["colField"]): Block {
  return {
    ...(raw as Omit<Block, "col" | "status">),
    col: String(raw[colField]),
    status: (raw.status as Status | undefined) ?? null,
  };
}

export default function TimeGrid({
  columns,
  url,
  query = "",
  colField,
  shiftCol,
  colDelta,
  withStatus = false,
  nowCol = null,
  refreshKey = 0,
  toolbar,
  headerExtra,
  hint,
  removeLabel = "Quitar",
}: Props) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  // Petición cuyos bloques ya llegaron; "cargando" se deriva comparándola con
  // la actual, en vez de poner un flag a true dentro del effect.
  const loadKey = `${url}${query}#${refreshKey}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ col: string; hour: number } | null>(
    null,
  );
  const [statusFor, setStatusFor] = useState<Block | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  // Selección (múltiple) + portapapeles para copiar/pegar bloques.
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [clipboard, setClipboard] = useState<ClipItem[] | null>(null);
  // Columna resaltada mientras se arrastra un bloque.
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  // Destino bajo el cursor mientras se arrastra: dónde caería el bloque que se
  // agarró. De aquí sale la sombra de previsualización.
  const [dropAt, setDropAt] = useState<{ col: string; hour: number } | null>(
    null,
  );
  // El bloque arrastrado va en estado (no solo en la ref) porque la sombra se
  // calcula en render; una ref no dispararía el re-render.
  const [draggingId, setDraggingId] = useState<number | null>(null);
  // Bloque que se está arrastrando y último hueco bajo el cursor (para Ctrl+V).
  const draggingRef = useRef<Block | null>(null);
  const hoverSlotRef = useRef<{ col: string; hour: number } | null>(null);

  const labelOf = (col: string) =>
    columns.find((c) => c.key === col)?.label ?? col;
  // Cuerpo de la API para fijar la columna: `date` va como string, `templateId`
  // como número.
  const colBody = (col: string) => ({
    [colField]: colField === "templateId" ? Number(col) : col,
  });

  // Carga tareas y subtareas una vez (para el selector y el modal).
  useEffect(() => {
    (async () => {
      try {
        const [tRes, sRes] = await Promise.all([
          fetch("/api/todos"),
          fetch("/api/subtasks"),
        ]);
        if (!tRes.ok || !sRes.ok) {
          throw new Error("No se pudieron cargar las tareas");
        }
        setTodos((await tRes.json()) as Todo[]);
        setSubtasks((await sRes.json()) as Subtask[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    })();
  }, []);

  // Carga los bloques (y recarga al navegar o cuando cambia `refreshKey`).
  // `cancelled` descarta respuestas de una petición ya superada: al pulsar
  // "Siguiente" dos veces seguidas no puede ganar la semana vieja.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${url}${query}`);
        if (!res.ok) throw new Error("No se pudo cargar el calendario");
        const rows = (await res.json()) as Record<string, unknown>[];
        if (!cancelled) setBlocks(rows.map((r) => toBlock(r, colField)));
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error desconocido");
        }
      } finally {
        if (!cancelled) setLoadedKey(loadKey);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, query, colField, loadKey]);
  const loading = loadedKey !== loadKey;

  // Tic cada minuto para mover la barra de "ahora".
  useEffect(() => {
    if (!nowCol) return;
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [nowCol]);

  // Índice de subtareas por tarea (para el selector y el modal de bloque).
  const subtasksByTodo = useMemo(() => {
    const map = new Map<number, Subtask[]>();
    for (const s of subtasks) {
      const arr = map.get(s.todoId);
      if (arr) arr.push(s);
      else map.set(s.todoId, [s]);
    }
    return map;
  }, [subtasks]);

  // Agrupa por columna.
  const byCol = useMemo(() => {
    const map = new Map<string, Block[]>();
    for (const b of blocks) {
      const arr = map.get(b.col);
      if (arr) arr.push(b);
      else map.set(b.col, [b]);
    }
    return map;
  }, [blocks]);

  // Grupo que mueve un arrastre: si el bloque agarrado es parte de una
  // selección múltiple, se mueve toda; si no, solo él.
  const dragGroup = (dragged: Block) =>
    selectedIds.includes(dragged.id) && selectedIds.length > 1
      ? blocks.filter((b) => selectedIds.includes(b.id))
      : [dragged];

  // Sombra de destino: dónde quedaría cada bloque si soltases AHORA. Se calcula
  // con la misma aritmética que `moveGroup` (mismo desfase para todo el grupo,
  // mismo recorte) para que lo que se ve sea exactamente lo que va a pasar.
  const ghostsByCol = useMemo(() => {
    const map = new Map<string, Ghost[]>();
    if (!dropAt || draggingId === null) return map;
    const dragged = blocks.find((b) => b.id === draggingId);
    if (!dragged) return map;

    const group =
      selectedIds.includes(dragged.id) && selectedIds.length > 1
        ? blocks.filter((b) => selectedIds.includes(b.id))
        : [dragged];

    const delta = colDelta(dragged.col, dropAt.col);
    const hourDelta = clampHourDelta(group, dropAt.hour - dragged.hour);
    const targets = group.map((b) => shiftCol(b.col, delta));
    // Si algún bloque del grupo se saldría de las columnas (p. ej. más allá de
    // la última plantilla), el movimiento no se hará: no hay sombra que pintar.
    if (targets.some((t) => t === null)) return map;

    group.forEach((b, i) => {
      const g: Ghost = {
        id: b.id,
        todoId: b.todoId,
        col: targets[i]!,
        hour: b.hour + hourDelta,
        duration: b.duration,
        title: b.title,
        subtaskTitle: b.subtaskTitle,
        color: b.color,
      };
      const arr = map.get(g.col);
      if (arr) arr.push(g);
      else map.set(g.col, [g]);
    });
    return map;
  }, [dropAt, draggingId, blocks, selectedIds, colDelta, shiftCol]);

  // Ids que se están moviendo: sus bloques originales se atenúan para que se
  // lea "esto sale de aquí y va allí" en vez de aparecer duplicado.
  const movingIds = useMemo(() => {
    const set = new Set<number>();
    for (const gs of ghostsByCol.values()) for (const g of gs) set.add(g.id);
    return set;
  }, [ghostsByCol]);

  // Limpia el estado de arrastre (se llama tanto al soltar como al cancelar).
  function endDrag() {
    draggingRef.current = null;
    setDraggingId(null);
    setDropAt(null);
    setDragOverCol(null);
  }

  // Posición de la barra de "ahora" (px desde el inicio del cuerpo).
  const nowIndex = nowCol ? columns.findIndex((c) => c.key === nowCol) : -1;
  const nowInfo = useMemo(() => {
    void nowTick;
    const d = new Date();
    const h = d.getHours();
    if (nowIndex === -1 || h < START_HOUR || h > END_HOUR) return null;
    const top = (h - START_HOUR + d.getMinutes() / 60) * ROW_H;
    return { top, label: `${pad(h)}:${pad(d.getMinutes())}` };
  }, [nowTick, nowIndex]);

  async function addBlock(
    todoId: number,
    col: string,
    hour: number,
    duration: number,
    subtaskId: number | null,
  ) {
    setPicker(null);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          todoId,
          ...colBody(col),
          hour,
          duration,
          subtaskId,
        }),
      });
      if (!res.ok) throw new Error("No se pudo añadir el bloque");
      const created = toBlock(await res.json(), colField);
      setBlocks((prev) => [...prev, created]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    }
  }

  // Update optimista genérico de un bloque (status, duration, subtarea…).
  // `body` se separa de `updates` porque algunos campos son solo de pintado:
  // `subtaskTitle` lo pinta la UI al instante, pero al servidor solo se le
  // manda `subtaskId` (el título lo resuelve él al responder).
  async function patchBlock(
    block: Block,
    updates: Partial<Block>,
    body: Record<string, unknown> = updates,
  ) {
    const prev = blocks;
    setBlocks((bs) => bs.map((b) => (b.id === block.id ? { ...b, ...updates } : b)));
    setError(null);
    try {
      const res = await fetch(`${url}/${block.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("No se pudo actualizar el bloque");
      const updated = toBlock(await res.json(), colField);
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
      const res = await fetch(`${url}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("No se pudo quitar el bloque");
    } catch (e) {
      setBlocks(prev);
      setError(e instanceof Error ? e.message : "Error desconocido");
    }
  }

  // Elimina en lote los bloques seleccionados (DELETE optimista con rollback).
  async function removeSelection() {
    const ids = selectedIds;
    if (ids.length === 0) return;
    const prev = blocks;
    setBlocks((bs) => bs.filter((b) => !ids.includes(b.id)));
    setSelectedIds([]);
    setStatusFor(null);
    setError(null);
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`${url}/${id}`, { method: "DELETE" }).then((res) => {
            // 404 = ya no existe; lo tratamos como borrado correcto.
            if (!res.ok && res.status !== 404) throw new Error();
          }),
        ),
      );
    } catch {
      setBlocks(prev);
      setError("No se pudieron eliminar los bloques");
    }
  }

  // Mueve un grupo de bloques (drag & drop) conservando su forma: aplica el
  // mismo desfase de columnas/horas a todos. PATCH optimista en lote.
  async function moveGroup(items: Block[], colShift: number, hourDelta: number) {
    if (items.length === 0) return;
    const hd = clampHourDelta(items, hourDelta);
    if (colShift === 0 && hd === 0) return;
    const moves = items.map((b) => ({
      id: b.id,
      col: shiftCol(b.col, colShift),
      hour: b.hour + hd,
    }));
    // Alguno se saldría de las columnas: no se mueve nada (igual que la sombra).
    if (moves.some((m) => m.col === null)) return;
    const byId = new Map(moves.map((m) => [m.id, m as { col: string; hour: number }]));
    const prev = blocks;
    setBlocks((bs) =>
      bs.map((b) => (byId.has(b.id) ? { ...b, ...byId.get(b.id)! } : b)),
    );
    setError(null);
    try {
      await Promise.all(
        moves.map((m) =>
          fetch(`${url}/${m.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...colBody(m.col!), hour: m.hour }),
          }).then((res) => {
            if (!res.ok) throw new Error();
          }),
        ),
      );
    } catch {
      setBlocks(prev);
      setError("No se pudieron mover los bloques");
    }
  }

  // Pega el grupo del portapapeles: el ancla cae en (col, hour) y el resto se
  // coloca según su desfase. POST en lote y añade los bloques creados. Los que
  // caerían fuera de las columnas (más allá de la última plantilla) se omiten.
  async function pasteGroupAt(col: string, hour: number) {
    if (!clipboard || clipboard.length === 0) return;
    const baseHour = clampHourDelta(
      clipboard.map((it) => ({ hour: it.hourOffset, duration: it.duration })),
      hour,
    );
    const items = clipboard
      .map((it) => ({ it, target: shiftCol(col, it.colOffset) }))
      .filter((x): x is { it: ClipItem; target: string } => x.target !== null);
    setError(null);
    try {
      const created = await Promise.all(
        items.map(({ it, target }) =>
          fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              todoId: it.todoId,
              subtaskId: it.subtaskId,
              ...colBody(target),
              hour: baseHour + it.hourOffset,
              duration: it.duration,
            }),
          }).then(async (res) => {
            if (!res.ok) throw new Error();
            return toBlock(await res.json(), colField);
          }),
        ),
      );
      setBlocks((prev) => [...prev, ...created]);
    } catch {
      setError("No se pudieron pegar los bloques");
    }
  }

  // Copia la selección al portapapeles usando desfases relativos al ancla (el
  // bloque más temprano por columna y luego hora).
  function copySelection() {
    const sel = blocks.filter((b) => selectedIds.includes(b.id));
    if (sel.length === 0) return;
    const anchor = sel.reduce((a, b) => {
      const d = colDelta(a.col, b.col);
      return d < 0 || (d === 0 && b.hour < a.hour) ? b : a;
    });
    setClipboard(
      sel.map((b) => ({
        todoId: b.todoId,
        subtaskId: b.subtaskId,
        // Para la etiqueta del portapapeles: si el bloque tiene subtarea, es
        // más útil ver «Trabajo · Revisar PRs» que solo «Trabajo».
        title: b.subtaskTitle ? `${b.title} · ${b.subtaskTitle}` : b.title,
        duration: b.duration,
        colOffset: colDelta(anchor.col, b.col),
        hourOffset: b.hour - anchor.hour,
      })),
    );
    setStatusFor(null);
  }

  // Atajos de teclado: Ctrl/⌘+C copia la selección, Ctrl/⌘+V pega en el hueco
  // bajo el cursor, Esc limpia portapapeles y selección.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // No secuestrar los atajos mientras se escribe en un campo (p. ej. el
      // buscador del selector de tarea); solo Escape sigue activo.
      const el = e.target as HTMLElement | null;
      const typing =
        el?.tagName === "INPUT" ||
        el?.tagName === "TEXTAREA" ||
        el?.tagName === "SELECT" ||
        el?.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (typing && e.key !== "Escape") return;
      if (mod && (e.key === "c" || e.key === "C")) {
        if (selectedIds.length === 0) return;
        e.preventDefault();
        copySelection();
      } else if (mod && (e.key === "v" || e.key === "V")) {
        const slot = hoverSlotRef.current;
        if (!clipboard || !slot) return;
        e.preventDefault();
        pasteGroupAt(slot.col, slot.hour);
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedIds.length > 0
      ) {
        e.preventDefault();
        removeSelection();
      } else if (e.key === "Escape") {
        if (clipboard) setClipboard(null);
        else if (selectedIds.length > 0) setSelectedIds([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, selectedIds, clipboard]);

  // Columnas de ancho fluido, pero con un mínimo para que no se aplasten.
  const gridCols = `3.5rem repeat(${columns.length}, minmax(100px, 1fr))`;

  return (
    <div>
      {/* Barra superior (navegación de semana, nueva plantilla…) */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {toolbar}
        {loading && <span className="text-xs text-zinc-400">cargando…</span>}
      </div>

      {/* Leyenda de estados */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        {withStatus &&
          STATUSES.map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${STATUS_UI[s].dot}`} />
              {STATUS_UI[s].label}
            </span>
          ))}
        <span className="text-zinc-400">
          {withStatus ? "· " : ""}
          {hint ??
            "clic para editar · Ctrl/⌘+clic para seleccionar varios · arrastra para mover · Ctrl+C / Ctrl+V para copiar"}
        </span>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </p>
      )}

      {/* Cuadrícula */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div style={{ minWidth: 56 + columns.length * 100 }}>
          {/* Cabecera de columnas */}
          <div
            className="grid border-b border-zinc-200 bg-zinc-50 text-sm dark:border-zinc-800 dark:bg-zinc-900/60"
            style={{ gridTemplateColumns: gridCols }}
          >
            <div className="px-2 py-2" />
            {columns.map((c) => (
              <div
                key={c.key}
                className={`group/head relative min-w-0 border-l border-zinc-200 px-2 py-2 text-center dark:border-zinc-800 ${
                  c.highlight ? "bg-zinc-900/5 dark:bg-white/5" : ""
                }`}
              >
                <div className="truncate font-medium text-zinc-700 dark:text-zinc-200">
                  {c.label}
                </div>
                {c.sub !== undefined && (
                  <div
                    className={`text-xs ${c.highlight ? "font-semibold text-red-500" : "text-zinc-400"}`}
                  >
                    {c.sub}
                  </div>
                )}
                {headerExtra?.(c)}
              </div>
            ))}
          </div>

          {/* Cuerpo: rejilla con columnas y bloques posicionados */}
          <div
            className="relative grid"
            style={{ height: BODY_H, gridTemplateColumns: gridCols }}
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

            {/* Columnas */}
            {columns.map((c) => {
              const key = c.key;
              const placed = layoutDay(byCol.get(key) ?? []);
              return (
                <div
                  key={key}
                  onDragOver={(e) => {
                    if (!draggingRef.current) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    const rect = e.currentTarget.getBoundingClientRect();
                    const hour = hourFromY(e.clientY, rect);
                    if (dragOverCol !== key) setDragOverCol(key);
                    // `dragover` se dispara sin parar; como la hora está
                    // encajada a la media, devolver el mismo objeto cuando el
                    // destino no cambia evita un re-render por píxel movido.
                    setDropAt((p) =>
                      p && p.col === key && p.hour === hour
                        ? p
                        : { col: key, hour },
                    );
                  }}
                  onDrop={(e) => {
                    const block = draggingRef.current;
                    if (!block) return;
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    // Encaja a la media hora más cercana según la Y del cursor.
                    const hour = hourFromY(e.clientY, rect);
                    moveGroup(
                      dragGroup(block),
                      colDelta(block.col, key),
                      hour - block.hour,
                    );
                    endDrag();
                  }}
                  className={`relative border-l border-zinc-200 dark:border-zinc-800 ${
                    c.highlight ? "bg-zinc-900/[0.02] dark:bg-white/[0.03]" : ""
                  } ${dragOverCol === key ? "bg-blue-500/10 dark:bg-blue-400/10" : ""}`}
                >
                  {/* Ranuras de fondo (media hora): líneas de hora sólidas y de
                      media hora punteadas + añadir/pegar. */}
                  {SLOTS.map((slot, i) => {
                    const onHour = Number.isInteger(slot);
                    return (
                      <button
                        key={slot}
                        onClick={() =>
                          clipboard
                            ? pasteGroupAt(key, slot)
                            : setPicker({ col: key, hour: slot })
                        }
                        onMouseEnter={() => {
                          hoverSlotRef.current = { col: key, hour: slot };
                        }}
                        aria-label={`Añadir tarea en ${c.label} a las ${fmtTime(slot)}`}
                        style={{ top: i * HALF_H, height: HALF_H }}
                        className={`group/slot absolute inset-x-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 ${
                          onHour
                            ? "border-t border-zinc-100 dark:border-zinc-800/70"
                            : "border-t border-dashed border-zinc-100/70 dark:border-zinc-800/40"
                        }`}
                      >
                        <span className="text-xs text-zinc-300 opacity-0 transition group-hover/slot:opacity-100 dark:text-zinc-600">
                          {clipboard ? "Pegar" : "+"}
                        </span>
                      </button>
                    );
                  })}

                  {/* Bloques */}
                  {placed.map(({ block, lane, lanes }) => {
                    const top = (block.hour - START_HOUR) * ROW_H;
                    const height = block.duration * ROW_H;
                    const w = 100 / lanes;
                    const ui = block.status ? STATUS_UI[block.status] : null;
                    const done = block.status === "done";
                    // Un bloque de 30 min mide 22 px útiles: solo cabe UNA
                    // línea, así que título y subtarea comparten fila.
                    const tight = block.duration <= 0.5;
                    return (
                      <button
                        key={block.id}
                        draggable
                        onDragStart={(e) => {
                          // Al arrastrar un bloque fuera de la selección, se pasa
                          // a mover solo ese (selección = ese bloque).
                          if (!selectedIds.includes(block.id)) {
                            setSelectedIds([block.id]);
                          }
                          draggingRef.current = block;
                          setDraggingId(block.id);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", String(block.id));
                        }}
                        onDragEnd={endDrag}
                        onMouseEnter={() => {
                          hoverSlotRef.current = {
                            col: block.col,
                            hour: block.hour,
                          };
                        }}
                        onClick={(e) => {
                          // Ctrl/⌘/Shift+clic: alterna en la selección sin abrir
                          // el modal. Clic normal: selecciona solo ese y lo edita.
                          if (e.ctrlKey || e.metaKey || e.shiftKey) {
                            setSelectedIds((ids) =>
                              ids.includes(block.id)
                                ? ids.filter((id) => id !== block.id)
                                : [...ids, block.id],
                            );
                          } else {
                            setSelectedIds([block.id]);
                            setStatusFor(block);
                          }
                        }}
                        title={`${block.title}${block.subtaskTitle ? ` · ${block.subtaskTitle}` : ""}${ui ? ` — ${ui.label}` : ""} · ${fmtTime(block.hour)}–${fmtTime(block.hour + block.duration)}`}
                        style={{
                          top: top + 1,
                          height: height - 2,
                          left: `calc(${lane * w}% + 2px)`,
                          width: `calc(${w}% - 4px)`,
                        }}
                        className={`absolute z-10 flex cursor-grab flex-col overflow-hidden rounded border-l-2 px-1.5 text-left text-xs transition-shadow hover:shadow-md active:cursor-grabbing ${tight ? "justify-center py-0" : "py-1"} ${blockColor(block.color, block.todoId)} ${
                          // Mientras se arrastra, el original se atenúa: así se
                          // lee "sale de aquí y va allí" en vez de verse el
                          // bloque duplicado en dos sitios a la vez.
                          movingIds.has(block.id)
                            ? "opacity-25"
                            : done
                              ? "opacity-60"
                              : ""
                        } ${
                          selectedIds.includes(block.id)
                            ? "ring-2 ring-zinc-800 dark:ring-white"
                            : ""
                        }`}
                      >
                        <span className="flex items-center gap-1">
                          {/* El estado ya no tiñe el bloque (eso es el color de
                              la tarea): se resume en este punto. */}
                          {ui && (
                            <span
                              className={`size-2.5 shrink-0 rounded-full ring-1 ring-white/80 dark:ring-black/40 ${ui.dot}`}
                            />
                          )}
                          <span
                            className={`min-w-0 truncate font-medium ${done ? "line-through" : ""}`}
                          >
                            {block.title}
                          </span>
                          {/* En 30 min no hay alto para una segunda línea, así
                              que la subtarea entra EN LA MISMA fila tras un
                              punto medio. `shrink-[3]` la hace encogerse antes
                              que el título: el bloque tiene que seguir
                              leyéndose como "Trabajo" aunque no quepa todo. */}
                          {tight && block.subtaskTitle && (
                            <span className="min-w-0 shrink-[3] truncate text-[10px] opacity-75">
                              · {block.subtaskTitle}
                            </span>
                          )}
                        </span>
                        {/* Con alto de sobra, la subtarea va DEBAJO del título
                            y no en su lugar, por la misma razón. */}
                        {block.subtaskTitle && !tight && (
                          <span
                            className={`truncate text-[10px] leading-tight opacity-75 ${ui ? "pl-3.5" : ""}`}
                          >
                            {block.subtaskTitle}
                          </span>
                        )}
                        {block.duration > 1 && (
                          <span className="mt-auto text-[10px] tabular-nums opacity-70">
                            {fmtTime(block.hour)}–{fmtTime(block.hour + block.duration)}
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {/* Sombra de destino. `pointer-events-none` es obligatorio:
                      si capturase eventos, se comería el `dragover` de la
                      columna y el destino dejaría de actualizarse justo cuando
                      el cursor pasa por encima de la propia sombra. */}
                  {(ghostsByCol.get(key) ?? []).map((g) => {
                    const gTight = g.duration <= 0.5;
                    return (
                      <div
                        key={g.id}
                        style={{
                          top: (g.hour - START_HOUR) * ROW_H + 1,
                          height: g.duration * ROW_H - 2,
                        }}
                        className={`pointer-events-none absolute inset-x-0.5 z-20 flex flex-col overflow-hidden rounded border-2 border-dashed border-zinc-500 px-1.5 text-xs opacity-90 shadow-lg dark:border-white ${gTight ? "justify-center py-0" : "py-1"} ${blockColor(g.color, g.todoId)}`}
                      >
                        {/* En 30 min todo va en una fila. La hora va PRIMERA:
                            arrastrando es el dato que se viene a mirar. */}
                        {gTight ? (
                          <span className="flex items-center gap-1">
                            <span className="shrink-0 text-[10px] font-semibold tabular-nums">
                              {fmtTime(g.hour)}–{fmtTime(g.hour + g.duration)}
                            </span>
                            <span className="min-w-0 truncate font-medium">
                              {g.title}
                            </span>
                            {g.subtaskTitle && (
                              <span className="min-w-0 shrink-[3] truncate text-[10px] opacity-75">
                                · {g.subtaskTitle}
                              </span>
                            )}
                          </span>
                        ) : (
                          <>
                            <span className="truncate font-medium">{g.title}</span>
                            {g.subtaskTitle && (
                              <span className="truncate text-[10px] leading-tight opacity-75">
                                {g.subtaskTitle}
                              </span>
                            )}
                            <span className="mt-auto truncate text-[10px] font-semibold tabular-nums">
                              {fmtTime(g.hour)}–{fmtTime(g.hour + g.duration)}
                            </span>
                          </>
                        )}
                      </div>
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
          subtasksByTodo={subtasksByTodo}
          where={labelOf(picker.col)}
          hour={picker.hour}
          onPick={(todoId, duration, subtaskId) =>
            addBlock(todoId, picker.col, picker.hour, duration, subtaskId)
          }
          onClose={() => setPicker(null)}
        />
      )}

      {statusFor && (
        <StatusModal
          block={statusFor}
          where={labelOf(statusFor.col)}
          withStatus={withStatus}
          removeLabel={removeLabel}
          subtasks={subtasksByTodo.get(statusFor.todoId) ?? []}
          onSubtask={(subtaskId) => {
            // El título viaja junto al id para que el update optimista no deje
            // el bloque con la subtarea anterior escrita hasta que responda.
            const subtaskTitle =
              subtasks.find((s) => s.id === subtaskId)?.title ?? null;
            if (subtaskId !== statusFor.subtaskId) {
              patchBlock(statusFor, { subtaskId, subtaskTitle }, { subtaskId });
            }
            setStatusFor((s) => (s ? { ...s, subtaskId, subtaskTitle } : s));
          }}
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

      {clipboard && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            <span className="text-zinc-600 dark:text-zinc-300">
              <span className="font-medium text-zinc-800 dark:text-zinc-100">
                {clipboard.length === 1
                  ? `«${clipboard[0].title}»`
                  : `${clipboard.length} bloques`}
              </span>{" "}
              copiado · clic en un hueco o <kbd className="rounded bg-zinc-100 px-1 font-mono text-xs dark:bg-zinc-800">Ctrl+V</kbd> para pegar
            </span>
            <button
              onClick={() => setClipboard(null)}
              className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {!clipboard && selectedIds.length >= 2 && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            <span className="text-zinc-600 dark:text-zinc-300">
              <span className="font-medium text-zinc-800 dark:text-zinc-100">
                {selectedIds.length} bloques
              </span>{" "}
              seleccionados · <kbd className="rounded bg-zinc-100 px-1 font-mono text-xs dark:bg-zinc-800">Ctrl+C</kbd> copiar · <kbd className="rounded bg-zinc-100 px-1 font-mono text-xs dark:bg-zinc-800">Supr</kbd> eliminar · arrastra para mover
            </span>
            <button
              onClick={copySelection}
              className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Copiar
            </button>
            <button
              onClick={removeSelection}
              className="rounded-full border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/50"
            >
              Eliminar
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Deseleccionar
            </button>
          </div>
        </div>
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
  where,
  withStatus,
  removeLabel,
  subtasks,
  onSubtask,
  onStatus,
  onDuration,
  onRemove,
  onClose,
}: {
  block: Block;
  where: string;
  withStatus: boolean;
  removeLabel: string;
  subtasks: Subtask[];
  onSubtask: (subtaskId: number | null) => void;
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

  const durationOptions = Array.from(
    { length: Math.round((24 - block.hour) / STEP) },
    (_, i) => (i + 1) * STEP,
  );

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
          {where} · {fmtTime(block.hour)}–{fmtTime(block.hour + block.duration)}
        </p>

        {/* El selector solo aparece si la tarea tiene subtareas: en una tarea
            suelta sería un desplegable con una única opción vacía. Las
            subtareas se crean en el tablero, no aquí. */}
        {subtasks.length > 0 && (
          <label className="mb-3 flex items-center justify-between gap-2 text-sm">
            <span className="text-xs font-medium text-zinc-500">Subtarea</span>
            <select
              value={block.subtaskId ?? ""}
              onChange={(e) =>
                onSubtask(e.target.value === "" ? null : Number(e.target.value))
              }
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="">— sin subtarea —</option>
              {subtasks.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        )}

        {withStatus && (
          <>
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
          </>
        )}

        <label className="mb-3 flex items-center justify-between gap-2 text-sm">
          <span className="text-xs font-medium text-zinc-500">Duración</span>
          <select
            value={block.duration}
            onChange={(e) => onDuration(Number(e.target.value))}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
          >
            {durationOptions.map((h) => (
              <option key={h} value={h}>
                {fmtDuration(h)}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={onRemove}
          className="w-full rounded-lg border border-red-200 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/50"
        >
          {removeLabel}
        </button>
      </div>
    </div>
  );
}

function TaskPicker({
  todos,
  subtasksByTodo,
  where,
  hour,
  onPick,
  onClose,
}: {
  todos: Todo[];
  subtasksByTodo: Map<number, Subtask[]>;
  where: string;
  hour: number;
  onPick: (todoId: number, duration: number, subtaskId: number | null) => void;
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

  const durationOptions = Array.from(
    { length: Math.round((24 - hour) / STEP) },
    (_, i) => (i + 1) * STEP,
  );
  // El buscador mira también las subtareas: escribir "PRs" tiene que encontrar
  // «Trabajo → Revisar PRs» aunque la tarea no se llame así. Si el que casa es
  // el título de la tarea, se listan todas sus subtareas; si casa una subtarea,
  // se listan solo las que casan.
  const needle = q.trim().toLowerCase();
  const filtered = todos
    .map((t) => {
      const subs = subtasksByTodo.get(t.id) ?? [];
      if (!needle) return { todo: t, subs };
      const hitTodo = t.title.toLowerCase().includes(needle);
      const hitSubs = subs.filter((s) => s.title.toLowerCase().includes(needle));
      if (hitTodo) return { todo: t, subs };
      if (hitSubs.length > 0) return { todo: t, subs: hitSubs };
      return null;
    })
    .filter((x): x is { todo: Todo; subs: Subtask[] } => x !== null);

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
          Añadir tarea · {where} a las {fmtTime(hour)}
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
                {fmtDuration(h)}
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
              <Link href="/" className="underline">
                tablero
              </Link>
              .
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-zinc-500">
              Sin coincidencias.
            </p>
          ) : (
            <ul className="flex flex-col">
              {filtered.map(({ todo: t, subs }) => (
                <li key={t.id}>
                  {/* La tarea a secas: bloque sin subtarea. */}
                  <button
                    onClick={() => onPick(t.id, duration, null)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    {/* Muestra del color de la tarea: así reconoces en el
                        selector el mismo color que verás en la cuadrícula. */}
                    <span
                      className={`h-4 w-1.5 shrink-0 rounded-full ${TASK_COLORS[resolveColor(t.color, t.id)].swatch}`}
                    />
                    <span className={`size-2 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`} />
                    <span className="truncate text-zinc-800 dark:text-zinc-100">
                      {t.title}
                    </span>
                  </button>

                  {/* Sus subtareas, indentadas: elegir una agenda la MISMA
                      tarea pero etiquetada con ese detalle. Un clic, sin
                      segundo paso. */}
                  {subs.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => onPick(t.id, duration, s.id)}
                      className="flex w-full items-center gap-2 rounded-lg py-1.5 pl-6 pr-2 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <span
                        className={`h-3 w-1 shrink-0 rounded-full opacity-60 ${TASK_COLORS[resolveColor(t.color, t.id)].swatch}`}
                      />
                      <span className="text-zinc-300 dark:text-zinc-600">↳</span>
                      <span className="truncate text-zinc-600 dark:text-zinc-300">
                        {s.title}
                      </span>
                    </button>
                  ))}
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
