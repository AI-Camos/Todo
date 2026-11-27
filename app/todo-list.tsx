"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  TASK_COLORS,
  TASK_COLOR_KEYS,
  resolveColor,
  type TaskColor,
} from "@/lib/colors";

type Status = "fixed" | "todo" | "doing" | "paused" | "this_week" | "done";
type Priority = "low" | "medium" | "high";

type Todo = {
  id: number;
  title: string;
  status: Status;
  priority: Priority;
  color: string | null; // clave de paleta; null = automático (derivado del id)
  createdAt: string;
};

// Subtarea: solo un título colgando de una tarea. No tiene estado, prioridad ni
// color propios — sirve para etiquetar el detalle de un bloque del calendario
// sin partir la tarea madre. Ver `subtasks` en lib/db/schema.ts.
type Subtask = {
  id: number;
  todoId: number;
  title: string;
  createdAt: string;
};

// El tablero se lee como un embudo: Bandeja → Esta semana → En progreso → Hecho.
// «Fijas» va delante y aparte: lo que no se negocia (trabajo, negocio) no es una
// elección semanal, así que no cuenta contra el tope de «Esta semana».
// El orden de pantalla es el de este array (no el del enum de la BD).
const COLUMNS: {
  status: Status;
  label: string;
  accent: string;
  // Tope orientativo: si todo entra en «Esta semana», la columna deja de decir
  // qué priorizas. No impide soltar más; solo avisa.
  limit?: number;
}[] = [
  { status: "fixed", label: "Fijas", accent: "bg-sky-500" },
  { status: "todo", label: "Bandeja", accent: "bg-zinc-400" },
  { status: "this_week", label: "Esta semana", accent: "bg-violet-500", limit: 5 },
  { status: "doing", label: "En progreso", accent: "bg-blue-500" },
  { status: "paused", label: "En pausa", accent: "bg-amber-500" },
  { status: "done", label: "Hecho", accent: "bg-emerald-500" },
];

const PRIORITY: Record<
  Priority,
  { label: string; rank: number; dot: string; text: string }
> = {
  high: { label: "Alta", rank: 0, dot: "bg-red-500", text: "text-red-600 dark:text-red-400" },
  medium: { label: "Media", rank: 1, dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  low: { label: "Baja", rank: 2, dot: "bg-zinc-400", text: "text-zinc-500 dark:text-zinc-400" },
};

const PRIORITIES: Priority[] = ["high", "medium", "low"];

export default function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("medium");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [activeId, setActiveId] = useState<number | null>(null);
  // Tarea pendiente de confirmar su borrado (null = no hay diálogo abierto).
  const [confirming, setConfirming] = useState<Todo | null>(null);

  const sensors = useSensors(
    // Pequeña distancia de activación: así un clic/doble-clic o pulsar un
    // control no dispara un arrastre por accidente.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  useEffect(() => {
    (async () => {
      try {
        // Las subtareas se piden de una vez, no por tarjeta: son un título por
        // fila y pedirlas por tarea sería un N+1 para nada.
        const [tRes, sRes] = await Promise.all([
          fetch("/api/todos"),
          fetch("/api/subtasks"),
        ]);
        if (!tRes.ok || !sRes.ok) throw new Error("No se pudo cargar la lista");
        setTodos((await tRes.json()) as Todo[]);
        setSubtasks((await sRes.json()) as Subtask[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function addTodo(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, priority: newPriority }),
      });
      if (!res.ok) throw new Error("No se pudo crear la tarea");
      const created = (await res.json()) as Todo;
      setTodos((prev) => [created, ...prev]);
      setNewTitle("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setAdding(false);
    }
  }

  // Actualiza una tarea (status/priority/title) con update optimista + rollback.
  async function patch(id: number, updates: Partial<Todo>) {
    const prev = todos;
    setTodos((ts) => ts.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    setError(null);
    try {
      const res = await fetch(`/api/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("No se pudo actualizar");
      const updated = (await res.json()) as Todo;
      setTodos((ts) => ts.map((t) => (t.id === updated.id ? updated : t)));
    } catch (e) {
      setTodos(prev); // rollback
      setError(e instanceof Error ? e.message : "Error desconocido");
    }
  }

  // --- subtareas ---------------------------------------------------------
  // No hay update optimista al crear: necesitamos el id real que asigna la BD
  // para poder referenciarla luego desde un bloque del calendario.
  async function addSubtask(todoId: number, title: string) {
    setError(null);
    try {
      const res = await fetch("/api/subtasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ todoId, title }),
      });
      if (!res.ok) throw new Error("No se pudo crear la subtarea");
      const created = (await res.json()) as Subtask;
      setSubtasks((ss) => [...ss, created]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    }
  }

  async function renameSubtask(id: number, title: string) {
    const prev = subtasks;
    setSubtasks((ss) => ss.map((s) => (s.id === id ? { ...s, title } : s)));
    setError(null);
    try {
      const res = await fetch(`/api/subtasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("No se pudo renombrar la subtarea");
    } catch (e) {
      setSubtasks(prev);
      setError(e instanceof Error ? e.message : "Error desconocido");
    }
  }

  // Borra solo la subtarea: los bloques que la usaban siguen en el calendario
  // como la tarea a secas (ON DELETE SET NULL en la BD).
  async function removeSubtask(id: number) {
    const prev = subtasks;
    setSubtasks((ss) => ss.filter((s) => s.id !== id));
    setError(null);
    try {
      const res = await fetch(`/api/subtasks/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error();
    } catch {
      setSubtasks(prev);
      setError("No se pudo eliminar la subtarea");
    }
  }

  function startEdit(todo: Todo) {
    setEditingId(todo.id);
    setEditTitle(todo.title);
  }

  function saveEdit(id: number) {
    const title = editTitle.trim();
    setEditingId(null);
    const current = todos.find((t) => t.id === id);
    if (!title || !current || title === current.title) return;
    patch(id, { title });
  }

  async function remove(id: number) {
    const prev = todos;
    setTodos((ts) => ts.filter((t) => t.id !== id));
    setError(null);
    try {
      const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("No se pudo eliminar");
    } catch (e) {
      setTodos(prev);
      setError(e instanceof Error ? e.message : "Error desconocido");
    }
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(Number(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const id = Number(active.id);
    const target = over.id as Status;
    const todo = todos.find((t) => t.id === id);
    if (!todo || todo.status === target) return;
    patch(id, { status: target });
  }

  // Agrupa por columna y ordena por prioridad y luego por recencia.
  const byStatus = useMemo(() => {
    const groups: Record<Status, Todo[]> = {
      fixed: [],
      todo: [],
      this_week: [],
      doing: [],
      paused: [],
      done: [],
    };
    for (const t of todos) groups[t.status].push(t);
    for (const status of Object.keys(groups) as Status[]) {
      groups[status].sort(
        (a, b) =>
          PRIORITY[a.priority].rank - PRIORITY[b.priority].rank ||
          b.createdAt.localeCompare(a.createdAt),
      );
    }
    return groups;
  }, [todos]);

  // Índice subtareas por tarea, para que cada tarjeta reciba solo las suyas.
  const subtasksByTodo = useMemo(() => {
    const map = new Map<number, Subtask[]>();
    for (const s of subtasks) {
      const arr = map.get(s.todoId);
      if (arr) arr.push(s);
      else map.set(s.todoId, [s]);
    }
    return map;
  }, [subtasks]);

  const activeTodo = activeId != null ? todos.find((t) => t.id === activeId) : null;
  const pending = todos.filter((t) => t.status !== "done").length;

  return (
    <div>
      <form onSubmit={addTodo} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Nueva tarea…"
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-400"
        />
        <select
          value={newPriority}
          onChange={(e) => setNewPriority(e.target.value as Priority)}
          aria-label="Prioridad de la nueva tarea"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-400"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY[p].label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={adding || newTitle.trim() === ""}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Añadir
        </button>
      </form>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-zinc-500">Cargando…</p>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          {/* Columnas de ancho FIJO con scroll horizontal, no un grid que
              reparte el ancho: con 6 columnas el grid las dejaba en ~170 px y
              los controles de la tarjeta no cabían. Al arrastrar cerca del
              borde, @dnd-kit desplaza el contenedor solo (autoScroll). */}
          <div className="-mx-1 mt-6 flex snap-x gap-4 overflow-x-auto px-1 pb-3">
            {COLUMNS.map((col) => (
              <Column
                key={col.status}
                status={col.status}
                label={col.label}
                accent={col.accent}
                limit={col.limit}
                todos={byStatus[col.status]}
                subtasksByTodo={subtasksByTodo}
                onAddSubtask={addSubtask}
                onRenameSubtask={renameSubtask}
                onRemoveSubtask={removeSubtask}
                editingId={editingId}
                editTitle={editTitle}
                onEditTitleChange={setEditTitle}
                onStartEdit={startEdit}
                onSaveEdit={saveEdit}
                onCancelEdit={() => setEditingId(null)}
                onChangePriority={(id, p) => patch(id, { priority: p })}
                onChangeColor={(id, c) => patch(id, { color: c })}
                onRemove={(id) =>
                  setConfirming(todos.find((t) => t.id === id) ?? null)
                }
                activeId={activeId}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeTodo ? <CardBody todo={activeTodo} dragging /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {!loading && (
        <p className="mt-4 text-xs text-zinc-500">
          {pending} sin terminar de {todos.length}
        </p>
      )}

      {confirming && (
        <ConfirmDelete
          todo={confirming}
          subtaskCount={subtasksByTodo.get(confirming.id)?.length ?? 0}
          onConfirm={() => {
            remove(confirming.id);
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

function Column({
  status,
  label,
  accent,
  limit,
  todos,
  subtasksByTodo,
  onAddSubtask,
  onRenameSubtask,
  onRemoveSubtask,
  editingId,
  editTitle,
  onEditTitleChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onChangePriority,
  onChangeColor,
  onRemove,
  activeId,
}: {
  status: Status;
  label: string;
  accent: string;
  limit?: number;
  todos: Todo[];
  subtasksByTodo: Map<number, Subtask[]>;
  onAddSubtask: (todoId: number, title: string) => void;
  onRenameSubtask: (id: number, title: string) => void;
  onRemoveSubtask: (id: number) => void;
  editingId: number | null;
  editTitle: string;
  onEditTitleChange: (v: string) => void;
  onStartEdit: (t: Todo) => void;
  onSaveEdit: (id: number) => void;
  onCancelEdit: () => void;
  onChangePriority: (id: number, p: Priority) => void;
  onChangeColor: (id: number, c: TaskColor | null) => void;
  onRemove: (id: number) => void;
  activeId: number | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      className={`flex min-h-40 w-72 shrink-0 snap-start flex-col gap-2 rounded-xl border p-2.5 transition-colors ${
        isOver
          ? "border-zinc-400 bg-zinc-100/70 dark:border-zinc-500 dark:bg-zinc-800/50"
          : "border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/40"
      }`}
    >
      <header className="flex items-center gap-2 px-1 py-0.5">
        <span className={`size-2 rounded-full ${accent}`} />
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          {label}
        </h2>
        {/* Con tope se pinta «n / tope», en rojo al pasarse. */}
        <span
          title={
            limit !== undefined && todos.length > limit
              ? `Te has pasado del tope de ${limit}: ¿qué no toca esta semana?`
              : undefined
          }
          className={`ml-auto text-xs tabular-nums ${
            limit !== undefined && todos.length > limit
              ? "font-semibold text-red-500"
              : "text-zinc-400"
          }`}
        >
          {todos.length}
          {limit !== undefined && ` / ${limit}`}
        </span>
      </header>

      {todos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-6 text-center text-xs text-zinc-400 dark:border-zinc-700">
          Arrastra tareas aquí
        </p>
      ) : (
        todos.map((todo) => (
          <Card
            key={todo.id}
            todo={todo}
            subtasks={subtasksByTodo.get(todo.id) ?? []}
            onAddSubtask={onAddSubtask}
            onRenameSubtask={onRenameSubtask}
            onRemoveSubtask={onRemoveSubtask}
            isEditing={editingId === todo.id}
            editTitle={editTitle}
            onEditTitleChange={onEditTitleChange}
            onStartEdit={onStartEdit}
            onSaveEdit={onSaveEdit}
            onCancelEdit={onCancelEdit}
            onChangePriority={onChangePriority}
            onChangeColor={onChangeColor}
            onRemove={onRemove}
            hidden={activeId === todo.id}
          />
        ))
      )}
    </section>
  );
}

function Card({
  todo,
  subtasks,
  onAddSubtask,
  onRenameSubtask,
  onRemoveSubtask,
  isEditing,
  editTitle,
  onEditTitleChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onChangePriority,
  onChangeColor,
  onRemove,
  hidden,
}: {
  todo: Todo;
  subtasks: Subtask[];
  onAddSubtask: (todoId: number, title: string) => void;
  onRenameSubtask: (id: number, title: string) => void;
  onRemoveSubtask: (id: number) => void;
  isEditing: boolean;
  editTitle: string;
  onEditTitleChange: (v: string) => void;
  onStartEdit: (t: Todo) => void;
  onSaveEdit: (id: number) => void;
  onCancelEdit: () => void;
  onChangePriority: (id: number, p: Priority) => void;
  onChangeColor: (id: number, c: TaskColor | null) => void;
  onRemove: (id: number) => void;
  hidden: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: todo.id,
  });
  // Posición del círculo de color al abrir la paleta (null = cerrada). La
  // paleta se pinta con `position: fixed` desde aquí; ver ColorPicker.
  const [pickerAt, setPickerAt] = useState<DOMRect | null>(null);
  const color = resolveColor(todo.color, todo.id);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: hidden ? 0.4 : 1 }}
      className="group relative rounded-lg border border-zinc-200 bg-white pl-1.5 shadow-sm dark:border-zinc-700 dark:bg-zinc-800"
    >
      {/* Franja de color de la tarea. Es un elemento propio y no `border-l-*`
          porque el `dark:border-zinc-700` de la tarjeta pinta los CUATRO
          bordes y, al ir después en el CSS, dejaba la franja gris en modo
          oscuro. Va encima del borde (-px) para que llegue a las esquinas. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute -bottom-px -left-px -top-px w-1.5 rounded-l-lg ${TASK_COLORS[color].swatch}`}
      />
      {/* Fila del título teñida con el color: lo justo para reconocer la
          tarea de un vistazo sin que la tarjeta entera compita con la columna. */}
      <div
        className={`flex items-start gap-1.5 rounded-tr-lg p-2.5 ${TASK_COLORS[color].tint}`}
      >
        {/* Asa de arrastre: solo aquí se inicia el drag, para no chocar con los controles. */}
        <button
          {...attributes}
          {...listeners}
          aria-label="Arrastrar tarea"
          className="mt-0.5 shrink-0 cursor-grab touch-none rounded px-0.5 text-zinc-300 hover:text-zinc-500 active:cursor-grabbing dark:text-zinc-600 dark:hover:text-zinc-400"
        >
          ⠿
        </button>

        {isEditing ? (
          <input
            autoFocus
            value={editTitle}
            onChange={(e) => onEditTitleChange(e.target.value)}
            onBlur={() => onSaveEdit(todo.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveEdit(todo.id);
              if (e.key === "Escape") onCancelEdit();
            }}
            className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm outline-none focus:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-900"
          />
        ) : (
          <span
            onDoubleClick={() => onStartEdit(todo)}
            className="flex-1 text-sm text-zinc-800 dark:text-zinc-100"
          >
            {todo.title}
          </span>
        )}
      </div>

      <SubtaskList
        todo={todo}
        subtasks={subtasks}
        onAdd={onAddSubtask}
        onRename={onRenameSubtask}
        onRemove={onRemoveSubtask}
      />

      {/* `flex-wrap`: si la tarjeta es muy estrecha, los controles bajan a otra
          línea DENTRO de la tarjeta en vez de desbordarse sobre la columna de al
          lado. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-zinc-100 px-2.5 py-1.5 dark:border-zinc-700/60">
        <label className="flex min-w-0 items-center gap-1.5 text-xs">
          <span className={`size-2 shrink-0 rounded-full ${PRIORITY[todo.priority].dot}`} />
          <select
            value={todo.priority}
            onChange={(e) => onChangePriority(todo.id, e.target.value as Priority)}
            aria-label={`Prioridad de "${todo.title}"`}
            className={`min-w-0 cursor-pointer rounded bg-transparent py-0.5 pr-1 outline-none ${PRIORITY[todo.priority].text}`}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p} className="text-zinc-800">
                {PRIORITY[p].label}
              </option>
            ))}
          </select>
        </label>

        {/* Selector de color: abre la paleta completa. El color viaja al
            calendario, que es donde de verdad sirve para distinguir bloques. */}
        <div className="shrink-0">
          <button
            onClick={(e) => {
              // La posición se lee AQUÍ, no dentro del updater de setState:
              // React ejecuta el updater después, durante el render, cuando el
              // evento ya terminó y `e.currentTarget` es null.
              const rect = e.currentTarget.getBoundingClientRect();
              setPickerAt((at) => (at ? null : rect));
            }}
            aria-label={`Color de "${todo.title}"`}
            aria-expanded={pickerAt !== null}
            className={`block size-4 rounded-full ring-1 ring-black/10 transition hover:scale-110 dark:ring-white/20 ${TASK_COLORS[color].swatch}`}
          />
          {pickerAt && (
            <ColorPicker
              anchor={pickerAt}
              current={todo.color}
              onPick={(c) => {
                onChangeColor(todo.id, c);
                setPickerAt(null);
              }}
              onClose={() => setPickerAt(null)}
            />
          )}
        </div>

        {/* Iconos y no texto: con 6 columnas la tarjeta mide ~150 px y «Editar»
            + «Eliminar» no cabían; el último se salía por la derecha y quedaba
            tapado por la columna siguiente. `shrink-0` para que no se aplasten,
            y opacidad parcial (no 0) para que se vean también sin hover. */}
        <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-50 transition group-hover:opacity-100">
          <button
            onClick={() => onStartEdit(todo)}
            aria-label={`Editar "${todo.title}"`}
            title="Editar"
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3.5" aria-hidden>
              <path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={() => onRemove(todo.id)}
            aria-label={`Eliminar "${todo.title}"`}
            title="Eliminar"
            className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3.5" aria-hidden>
              <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4M6.75 6.5v4.5M9.25 6.5v4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// Lista de subtareas dentro de la tarjeta. Es el "catálogo" de la tarea: lo que
// aquí escribas es lo que podrás elegir al agendar un bloque en el calendario.
// Deliberadamente sin estado ni prioridad por subtarea: si necesitas eso, lo
// que quieres es una tarea, no una subtarea.
function SubtaskList({
  todo,
  subtasks,
  onAdd,
  onRename,
  onRemove,
}: {
  todo: Todo;
  subtasks: Subtask[];
  onAdd: (todoId: number, title: string) => void;
  onRename: (id: number, title: string) => void;
  onRemove: (id: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");

  function commitNew() {
    const title = draft.trim();
    setDraft("");
    if (title) onAdd(todo.id, title);
  }

  function commitEdit(s: Subtask) {
    const title = editDraft.trim();
    setEditingId(null);
    if (title && title !== s.title) onRename(s.id, title);
  }

  return (
    <div className="border-t border-zinc-100 px-2.5 py-1 dark:border-zinc-700/60">
      {subtasks.length > 0 && (
        <ul className="flex flex-col">
          {subtasks.map((s) => (
            <li key={s.id} className="group/sub flex items-center gap-1.5 py-0.5">
              <span className="shrink-0 text-zinc-300 dark:text-zinc-600">↳</span>
              {editingId === s.id ? (
                <input
                  autoFocus
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onBlur={() => commitEdit(s)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit(s);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="w-full rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs outline-none focus:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-900"
                />
              ) : (
                <>
                  <button
                    onClick={() => {
                      setEditingId(s.id);
                      setEditDraft(s.title);
                    }}
                    className="flex-1 truncate text-left text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  >
                    {s.title}
                  </button>
                  <button
                    onClick={() => onRemove(s.id)}
                    aria-label={`Eliminar subtarea "${s.title}"`}
                    className="shrink-0 rounded px-1 text-xs leading-none text-zinc-400 opacity-0 transition hover:text-red-600 group-hover/sub:opacity-100 dark:hover:text-red-400"
                  >
                    ×
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Nueva subtarea…"
          onBlur={() => {
            commitNew();
            setAdding(false);
          }}
          onKeyDown={(e) => {
            // Enter guarda y deja el campo abierto: normalmente se apuntan
            // varias seguidas (las 4 partes del bloque de trabajo).
            if (e.key === "Enter") {
              e.preventDefault();
              commitNew();
            }
            if (e.key === "Escape") {
              setDraft("");
              setAdding(false);
            }
          }}
          className="my-0.5 w-full rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs outline-none focus:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-900"
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className={`w-full rounded px-1 py-0.5 text-left text-xs text-zinc-400 transition hover:text-zinc-700 dark:hover:text-zinc-200 ${
            // Sin subtareas el botón solo aparece al pasar por encima, para no
            // llenar el tablero de "+ subtarea" en tareas que no las usan.
            subtasks.length === 0 ? "opacity-0 group-hover:opacity-100" : ""
          }`}
        >
          + subtarea
        </button>
      )}
    </div>
  );
}

// Paleta desplegable. `current` es el valor CRUDO de la tarea (null = auto),
// no el resuelto: hay que poder distinguir "gris automático" de "gris elegido".
// Confirmación antes de borrar una tarea. No es un trámite: el borrado va en
// cascada (subtareas, bloques del calendario y de los días modelo), así que un
// clic accidental en «Job» se llevaría semanas de horario. Por eso el foco
// arranca en «Cancelar»: Enter sin pensar no borra nada.
function ConfirmDelete({
  todo,
  subtaskCount,
  onConfirm,
  onCancel,
}: {
  todo: Todo;
  subtaskCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-32"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <p
          id="confirm-delete-title"
          className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-100"
        >
          ¿Seguro que quieres eliminar «{todo.title}»?
        </p>
        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
          Se borrarán también{" "}
          {subtaskCount > 0 &&
            `sus ${subtaskCount} subtarea${subtaskCount === 1 ? "" : "s"} y `}
          todos sus bloques del calendario y de los días modelo. No se puede
          deshacer.
        </p>
        <div className="flex justify-end gap-2">
          <button
            autoFocus
            onClick={onCancel}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

// Alto aproximado de la paleta (5 filas de colores + «Automático»): decide si
// cabe abriéndose hacia arriba o hay que abrirla hacia abajo.
const PICKER_H = 180;
const PICKER_W = 180;

// La paleta va con `position: fixed` relativa a la ventana, anclada al círculo
// de color. No puede ser `absolute` dentro de la tarjeta: el tablero tiene
// scroll horizontal, y un contenedor con overflow recorta también en vertical,
// así que en la primera tarjeta de una columna la paleta quedaba cortada.
// Al hacer scroll se cierra, porque la posición guardada dejaría de cuadrar.
function ColorPicker({
  anchor,
  current,
  onPick,
  onClose,
}: {
  anchor: DOMRect;
  current: string | null;
  onPick: (c: TaskColor | null) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    // `capture`: el evento de scroll no burbujea, y el que importa es el del
    // contenedor del tablero, no solo el de la ventana.
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const openUp = anchor.top > PICKER_H + 16;
  // Sin salirse por la derecha en la última columna visible.
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - PICKER_W - 8));
  const style = openUp
    ? { left, bottom: window.innerHeight - anchor.top + 8 }
    : { left, top: anchor.bottom + 8 };

  return (
    <>
      {/* Capa que cierra al hacer clic fuera, sin necesidad de refs. */}
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div
        role="dialog"
        style={style}
        className="fixed z-30 w-max rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="grid grid-cols-6 gap-1.5">
          {TASK_COLOR_KEYS.map((c) => (
            <button
              key={c}
              autoFocus={c === current}
              onClick={() => onPick(c)}
              title={TASK_COLORS[c].label}
              aria-label={TASK_COLORS[c].label}
              className={`size-5 rounded-full transition hover:scale-110 ${TASK_COLORS[c].swatch} ${
                current === c
                  ? "ring-2 ring-zinc-900 ring-offset-1 dark:ring-white dark:ring-offset-zinc-800"
                  : "ring-1 ring-black/10 dark:ring-white/20"
              }`}
            />
          ))}
        </div>
        <button
          onClick={() => onPick(null)}
          className={`mt-2 w-full rounded px-2 py-1 text-xs transition hover:bg-zinc-100 dark:hover:bg-zinc-700 ${
            current === null
              ? "font-medium text-zinc-900 dark:text-white"
              : "text-zinc-500"
          }`}
        >
          Automático{current === null ? " ✓" : ""}
        </button>
      </div>
    </>
  );
}

// Copia visual usada dentro del DragOverlay mientras se arrastra.
function CardBody({ todo, dragging }: { todo: Todo; dragging?: boolean }) {
  return (
    // Misma franja + tinte que la tarjeta real: arrastrando tiene que seguir
    // reconociéndose qué tarea es.
    <div
      className={`relative rounded-lg border border-zinc-300 bg-white pl-1.5 shadow-lg dark:border-zinc-600 dark:bg-zinc-800 ${
        dragging ? "cursor-grabbing" : ""
      }`}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute -bottom-px -left-px -top-px w-1.5 rounded-l-lg ${TASK_COLORS[resolveColor(todo.color, todo.id)].swatch}`}
      />
      <div
        className={`flex items-center gap-1.5 rounded-tr-lg p-2.5 pb-1.5 ${TASK_COLORS[resolveColor(todo.color, todo.id)].tint}`}
      >
        <span className="text-zinc-400">⠿</span>
        <span className="text-sm text-zinc-800 dark:text-zinc-100">{todo.title}</span>
      </div>
      <div className="flex items-center gap-1.5 px-2.5 pb-2.5 pt-1.5 text-xs">
        <span className={`size-2 rounded-full ${PRIORITY[todo.priority].dot}`} />
        <span className={PRIORITY[todo.priority].text}>
          {PRIORITY[todo.priority].label}
        </span>
      </div>
    </div>
  );
}
