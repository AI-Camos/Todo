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
  | "slate"
  // Ampliación: variantes oscuras…
  | "wine"
  | "brown"
  | "olive"
  | "forest"
  | "petrol"
  | "navy"
  // …y claras / neutras.
  | "peach"
  | "mint"
  | "lavender"
  | "blush"
  | "stone"
  | "charcoal";

type Entry = {
  label: string;
  /** Punto/muestra sólida para el selector de la paleta. */
  swatch: string;
  /** Tinte suave de la fila del título de la tarjeta del tablero. Solo esa
   *  fila: teñir la tarjeta entera haría que el color compitiera con la
   *  columna, que es lo que de verdad dice en qué estado está. */
  tint: string;
  /** Bloque del calendario: borde izquierdo + fondo + texto, claro y oscuro. */
  block: string;
};

export const TASK_COLORS: Record<TaskColor, Entry> = {
  rose: {
    label: "Rosa",
    swatch: "bg-rose-500",
    tint: "bg-rose-50 dark:bg-rose-500/15",
    block: "border-l-rose-500 bg-rose-100 text-rose-900 dark:bg-rose-500/25 dark:text-rose-100",
  },
  red: {
    label: "Rojo",
    swatch: "bg-red-500",
    tint: "bg-red-50 dark:bg-red-500/15",
    block: "border-l-red-500 bg-red-100 text-red-900 dark:bg-red-500/25 dark:text-red-100",
  },
  orange: {
    label: "Naranja",
    swatch: "bg-orange-500",
    tint: "bg-orange-50 dark:bg-orange-500/15",
    block: "border-l-orange-500 bg-orange-100 text-orange-900 dark:bg-orange-500/25 dark:text-orange-100",
  },
  amber: {
    label: "Ámbar",
    swatch: "bg-amber-500",
    tint: "bg-amber-50 dark:bg-amber-500/15",
    block: "border-l-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-500/25 dark:text-amber-100",
  },
  yellow: {
    label: "Amarillo",
    swatch: "bg-yellow-500",
    tint: "bg-yellow-50 dark:bg-yellow-500/15",
    block: "border-l-yellow-500 bg-yellow-100 text-yellow-900 dark:bg-yellow-500/25 dark:text-yellow-100",
  },
  lime: {
    label: "Lima",
    swatch: "bg-lime-500",
    tint: "bg-lime-50 dark:bg-lime-500/15",
    block: "border-l-lime-500 bg-lime-100 text-lime-900 dark:bg-lime-500/25 dark:text-lime-100",
  },
  green: {
    label: "Verde",
    swatch: "bg-green-500",
    tint: "bg-green-50 dark:bg-green-500/15",
    block: "border-l-green-500 bg-green-100 text-green-900 dark:bg-green-500/25 dark:text-green-100",
  },
  emerald: {
    label: "Esmeralda",
    swatch: "bg-emerald-500",
    tint: "bg-emerald-50 dark:bg-emerald-500/15",
    block: "border-l-emerald-500 bg-emerald-100 text-emerald-900 dark:bg-emerald-500/25 dark:text-emerald-100",
  },
  teal: {
    label: "Turquesa",
    swatch: "bg-teal-500",
    tint: "bg-teal-50 dark:bg-teal-500/15",
    block: "border-l-teal-500 bg-teal-100 text-teal-900 dark:bg-teal-500/25 dark:text-teal-100",
  },
  cyan: {
    label: "Cian",
    swatch: "bg-cyan-500",
    tint: "bg-cyan-50 dark:bg-cyan-500/15",
    block: "border-l-cyan-500 bg-cyan-100 text-cyan-900 dark:bg-cyan-500/25 dark:text-cyan-100",
  },
  sky: {
    label: "Celeste",
    swatch: "bg-sky-500",
    tint: "bg-sky-50 dark:bg-sky-500/15",
    block: "border-l-sky-500 bg-sky-100 text-sky-900 dark:bg-sky-500/25 dark:text-sky-100",
  },
  blue: {
    label: "Azul",
    swatch: "bg-blue-500",
    tint: "bg-blue-50 dark:bg-blue-500/15",
    block: "border-l-blue-500 bg-blue-100 text-blue-900 dark:bg-blue-500/25 dark:text-blue-100",
  },
  indigo: {
    label: "Índigo",
    swatch: "bg-indigo-500",
    tint: "bg-indigo-50 dark:bg-indigo-500/15",
    block: "border-l-indigo-500 bg-indigo-100 text-indigo-900 dark:bg-indigo-500/25 dark:text-indigo-100",
  },
  violet: {
    label: "Violeta",
    swatch: "bg-violet-500",
    tint: "bg-violet-50 dark:bg-violet-500/15",
    block: "border-l-violet-500 bg-violet-100 text-violet-900 dark:bg-violet-500/25 dark:text-violet-100",
  },
  purple: {
    label: "Morado",
    swatch: "bg-purple-500",
    tint: "bg-purple-50 dark:bg-purple-500/15",
    block: "border-l-purple-500 bg-purple-100 text-purple-900 dark:bg-purple-500/25 dark:text-purple-100",
  },
  fuchsia: {
    label: "Fucsia",
    swatch: "bg-fuchsia-500",
    tint: "bg-fuchsia-50 dark:bg-fuchsia-500/15",
    block: "border-l-fuchsia-500 bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-500/25 dark:text-fuchsia-100",
  },
  pink: {
    label: "Rosa fuerte",
    swatch: "bg-pink-500",
    tint: "bg-pink-50 dark:bg-pink-500/15",
    block: "border-l-pink-500 bg-pink-100 text-pink-900 dark:bg-pink-500/25 dark:text-pink-100",
  },
  slate: {
    label: "Gris",
    swatch: "bg-slate-500",
    tint: "bg-slate-50 dark:bg-slate-500/15",
    block: "border-l-slate-500 bg-slate-100 text-slate-900 dark:bg-slate-500/25 dark:text-slate-100",
  },
  // --- Ampliación (tonos oscuros): mismo tono base, otro peso. El fondo del
  // bloque va un paso más fuerte (-200) para no confundirse con el claro. ---
  wine: {
    label: "Burdeos",
    swatch: "bg-rose-800",
    tint: "bg-rose-100 dark:bg-rose-800/30",
    block: "border-l-rose-800 bg-rose-200 text-rose-950 dark:bg-rose-800/40 dark:text-rose-100",
  },
  brown: {
    label: "Marrón",
    swatch: "bg-amber-800",
    tint: "bg-amber-100 dark:bg-amber-800/30",
    block: "border-l-amber-800 bg-amber-200 text-amber-950 dark:bg-amber-800/40 dark:text-amber-100",
  },
  olive: {
    label: "Oliva",
    swatch: "bg-lime-700",
    tint: "bg-lime-100 dark:bg-lime-700/30",
    block: "border-l-lime-700 bg-lime-200 text-lime-950 dark:bg-lime-700/40 dark:text-lime-100",
  },
  forest: {
    label: "Verde bosque",
    swatch: "bg-green-800",
    tint: "bg-green-100 dark:bg-green-800/30",
    block: "border-l-green-800 bg-green-200 text-green-950 dark:bg-green-800/40 dark:text-green-100",
  },
  petrol: {
    label: "Petróleo",
    swatch: "bg-teal-700",
    tint: "bg-teal-100 dark:bg-teal-700/30",
    block: "border-l-teal-700 bg-teal-200 text-teal-950 dark:bg-teal-700/40 dark:text-teal-100",
  },
  navy: {
    label: "Azul marino",
    swatch: "bg-blue-800",
    tint: "bg-blue-100 dark:bg-blue-800/30",
    block: "border-l-blue-800 bg-blue-200 text-blue-950 dark:bg-blue-800/40 dark:text-blue-100",
  },
  // --- Ampliación (tonos claros y neutros). ---
  peach: {
    label: "Melocotón",
    swatch: "bg-orange-300",
    tint: "bg-orange-50 dark:bg-orange-300/10",
    block: "border-l-orange-300 bg-orange-50 text-orange-900 dark:bg-orange-300/20 dark:text-orange-100",
  },
  mint: {
    label: "Menta",
    swatch: "bg-emerald-300",
    tint: "bg-emerald-50 dark:bg-emerald-300/10",
    block: "border-l-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-300/20 dark:text-emerald-100",
  },
  lavender: {
    label: "Lavanda",
    swatch: "bg-violet-300",
    tint: "bg-violet-50 dark:bg-violet-300/10",
    block: "border-l-violet-300 bg-violet-50 text-violet-900 dark:bg-violet-300/20 dark:text-violet-100",
  },
  blush: {
    label: "Rosa palo",
    swatch: "bg-pink-300",
    tint: "bg-pink-50 dark:bg-pink-300/10",
    block: "border-l-pink-300 bg-pink-50 text-pink-900 dark:bg-pink-300/20 dark:text-pink-100",
  },
  stone: {
    label: "Piedra",
    swatch: "bg-stone-500",
    tint: "bg-stone-50 dark:bg-stone-500/15",
    block: "border-l-stone-500 bg-stone-100 text-stone-900 dark:bg-stone-500/25 dark:text-stone-100",
  },
  // Casi negro: en modo oscuro el borde se aclara, o desaparecería contra el fondo.
  charcoal: {
    label: "Carbón",
    swatch: "bg-zinc-800 dark:bg-zinc-300",
    tint: "bg-zinc-100 dark:bg-zinc-300/10",
    block: "border-l-zinc-800 bg-zinc-200 text-zinc-900 dark:border-l-zinc-300 dark:bg-zinc-600/40 dark:text-zinc-100",
  },
};

export const TASK_COLOR_KEYS = Object.keys(TASK_COLORS) as TaskColor[];

// Colores entre los que se reparte el modo AUTOMÁTICO (`color = null`). Es la
// paleta original de 18 y NO debe crecer con las ampliaciones: el automático
// sale de `id % length`, así que añadir colores aquí cambiaría de golpe el
// color de todas las tareas que no lo tienen elegido a mano.
const AUTO_COLOR_KEYS: TaskColor[] = [
  "rose", "red", "orange", "amber", "yellow", "lime",
  "green", "emerald", "teal", "cyan", "sky", "blue",
  "indigo", "violet", "purple", "fuchsia", "pink", "slate",
];

export function isTaskColor(v: unknown): v is TaskColor {
  return typeof v === "string" && v in TASK_COLORS;
}

/**
 * Color efectivo de una tarea: el elegido, o uno derivado del id si es `null`.
 * El derivado es estable entre sesiones (mismo id → mismo color).
 */
export function resolveColor(color: string | null | undefined, todoId: number): TaskColor {
  if (isTaskColor(color)) return color;
  return AUTO_COLOR_KEYS[Math.abs(todoId) % AUTO_COLOR_KEYS.length];
}
