// Paleta de colores de tarea.
//
// El color lo elige el usuario y se guarda en `todos.color` como CLAVE
// ("violet", "sky", …), nunca como clase de Tailwind ni como hex: así la paleta
// se puede retocar aquí sin migrar la BD ni tocar filas. Es el mismo criterio
// que los precios de modelo en observabilidad — constante versionada en código.
//
// `color = null` significa "automático": se deriva del id de la tarea. Las
// tareas que ya existían se quedan así hasta que elijas un color a mano.
//
// Las clases van COMPLETAS y literales a propósito: Tailwind escanea el código
// fuente y no puede resolver un string construido (`bg-${c}-100` no existiría).

export type TaskColor =
  | "rose"
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "green"
  | "emerald"
  | "teal"
  | "cyan"
  | "sky"
  | "blue"
  | "indigo"
  | "violet"
  | "purple"
  | "fuchsia"
  | "pink"
  | "slate";

type Entry = {
  label: string;
  /** Punto/muestra sólida para el selector de la paleta. */
  swatch: string;
  /** Borde izquierdo de la tarjeta del tablero. */
  border: string;
  /** Bloque del calendario: borde izquierdo + fondo + texto, claro y oscuro. */
  block: string;
};

export const TASK_COLORS: Record<TaskColor, Entry> = {
  rose: {
    label: "Rosa",
    swatch: "bg-rose-500",
    border: "border-l-rose-500",
    block: "border-l-rose-500 bg-rose-100 text-rose-900 dark:bg-rose-500/25 dark:text-rose-100",
  },
  red: {
    label: "Rojo",
    swatch: "bg-red-500",
    border: "border-l-red-500",
    block: "border-l-red-500 bg-red-100 text-red-900 dark:bg-red-500/25 dark:text-red-100",
  },
  orange: {
    label: "Naranja",
    swatch: "bg-orange-500",
    border: "border-l-orange-500",
    block: "border-l-orange-500 bg-orange-100 text-orange-900 dark:bg-orange-500/25 dark:text-orange-100",
  },
  amber: {
    label: "Ámbar",
    swatch: "bg-amber-500",
    border: "border-l-amber-500",
    block: "border-l-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-500/25 dark:text-amber-100",
  },
  yellow: {
    label: "Amarillo",
    swatch: "bg-yellow-500",
    border: "border-l-yellow-500",
    block: "border-l-yellow-500 bg-yellow-100 text-yellow-900 dark:bg-yellow-500/25 dark:text-yellow-100",
  },
  lime: {
    label: "Lima",
    swatch: "bg-lime-500",
    border: "border-l-lime-500",
    block: "border-l-lime-500 bg-lime-100 text-lime-900 dark:bg-lime-500/25 dark:text-lime-100",
  },
  green: {
    label: "Verde",
    swatch: "bg-green-500",
    border: "border-l-green-500",
    block: "border-l-green-500 bg-green-100 text-green-900 dark:bg-green-500/25 dark:text-green-100",
  },
  emerald: {
    label: "Esmeralda",
    swatch: "bg-emerald-500",
    border: "border-l-emerald-500",
    block: "border-l-emerald-500 bg-emerald-100 text-emerald-900 dark:bg-emerald-500/25 dark:text-emerald-100",
  },
  teal: {
    label: "Turquesa",
    swatch: "bg-teal-500",
    border: "border-l-teal-500",
    block: "border-l-teal-500 bg-teal-100 text-teal-900 dark:bg-teal-500/25 dark:text-teal-100",
  },
  cyan: {
    label: "Cian",
    swatch: "bg-cyan-500",
    border: "border-l-cyan-500",
    block: "border-l-cyan-500 bg-cyan-100 text-cyan-900 dark:bg-cyan-500/25 dark:text-cyan-100",
  },
  sky: {
    label: "Celeste",
    swatch: "bg-sky-500",
    border: "border-l-sky-500",
    block: "border-l-sky-500 bg-sky-100 text-sky-900 dark:bg-sky-500/25 dark:text-sky-100",
  },
  blue: {
    label: "Azul",
    swatch: "bg-blue-500",
    border: "border-l-blue-500",
    block: "border-l-blue-500 bg-blue-100 text-blue-900 dark:bg-blue-500/25 dark:text-blue-100",
  },
  indigo: {
    label: "Índigo",
    swatch: "bg-indigo-500",
    border: "border-l-indigo-500",
    block: "border-l-indigo-500 bg-indigo-100 text-indigo-900 dark:bg-indigo-500/25 dark:text-indigo-100",
  },
  violet: {
    label: "Violeta",
    swatch: "bg-violet-500",
    border: "border-l-violet-500",
    block: "border-l-violet-500 bg-violet-100 text-violet-900 dark:bg-violet-500/25 dark:text-violet-100",
  },
  purple: {
    label: "Morado",
    swatch: "bg-purple-500",
    border: "border-l-purple-500",
    block: "border-l-purple-500 bg-purple-100 text-purple-900 dark:bg-purple-500/25 dark:text-purple-100",
  },
  fuchsia: {
    label: "Fucsia",
    swatch: "bg-fuchsia-500",
    border: "border-l-fuchsia-500",
    block: "border-l-fuchsia-500 bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-500/25 dark:text-fuchsia-100",
  },
  pink: {
    label: "Rosa fuerte",
    swatch: "bg-pink-500",
    border: "border-l-pink-500",
    block: "border-l-pink-500 bg-pink-100 text-pink-900 dark:bg-pink-500/25 dark:text-pink-100",
  },
  slate: {
    label: "Gris",
    swatch: "bg-slate-500",
    border: "border-l-slate-500",
    block: "border-l-slate-500 bg-slate-100 text-slate-900 dark:bg-slate-500/25 dark:text-slate-100",
  },
};

export const TASK_COLOR_KEYS = Object.keys(TASK_COLORS) as TaskColor[];

export function isTaskColor(v: unknown): v is TaskColor {
  return typeof v === "string" && v in TASK_COLORS;
}

/**
 * Color efectivo de una tarea: el elegido, o uno derivado del id si es `null`.
 * El derivado es estable entre sesiones (mismo id → mismo color).
 */
export function resolveColor(color: string | null | undefined, todoId: number): TaskColor {
  if (isTaskColor(color)) return color;
  return TASK_COLOR_KEYS[Math.abs(todoId) % TASK_COLOR_KEYS.length];
}
