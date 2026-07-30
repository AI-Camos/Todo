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

type Status = "todo" | "doing" | "paused" | "done";
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

const COLUMNS: { status: Status; label: string; accent: string }[] = [
  { status: "todo", label: "Por hacer", accent: "bg-zinc-400" },
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
      todo: [],
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
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {COLUMNS.map((col) => (
              <Column
                key={col.status}
                status={col.status}
                label={col.label}
                accent={col.accent}
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
                onRemove={remove}
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
    </div>
  );
}

function Column({
  status,
  label,
  accent,
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
      className={`flex min-h-40 flex-col gap-2 rounded-xl border p-2.5 transition-colors ${
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
        <span className="ml-auto text-xs tabular-nums text-zinc-400">
          {todos.length}
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
  const [pickingColor, setPickingColor] = useState(false);
  const color = resolveColor(todo.color, todo.id);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: hidden ? 0.4 : 1 }}
      className={`group relative rounded-lg border border-l-4 border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800 ${TASK_COLORS[color].border}`}
    >
      <div className="flex items-start gap-1.5 p-2.5">
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

      <div className="flex items-center gap-2 border-t border-zinc-100 px-2.5 py-1.5 dark:border-zinc-700/60">
        <label className="flex items-center gap-1.5 text-xs">
          <span className={`size-2 rounded-full ${PRIORITY[todo.priority].dot}`} />
          <select
            value={todo.priority}
            onChange={(e) => onChangePriority(todo.id, e.target.value as Priority)}
            aria-label={`Prioridad de "${todo.title}"`}
            className={`cursor-pointer rounded bg-transparent py-0.5 pr-1 outline-none ${PRIORITY[todo.priority].text}`}
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
        <div className="relative">
          <button
            onClick={() => setPickingColor((v) => !v)}
            aria-label={`Color de "${todo.title}"`}
            aria-expanded={pickingColor}
            className={`block size-4 rounded-full ring-1 ring-black/10 transition hover:scale-110 dark:ring-white/20 ${TASK_COLORS[color].swatch}`}
          />
          {pickingColor && (
            <ColorPicker
              current={todo.color}
              onPick={(c) => {
                onChangeColor(todo.id, c);
                setPickingColor(false);
              }}
              onClose={() => setPickingColor(false)}
            />
          )}
        </div>

        <button
          onClick={() => onStartEdit(todo)}
          className="ml-auto rounded px-1.5 py-0.5 text-xs text-zinc-400 opacity-0 transition hover:bg-zinc-100 hover:text-zinc-700 group-hover:opacity-100 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
        >
          Editar
        </button>
        <button
          onClick={() => onRemove(todo.id)}
          aria-label={`Eliminar "${todo.title}"`}
          className="rounded px-1.5 py-0.5 text-xs text-zinc-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-950/50 dark:hover:text-red-400"
        >
          Eliminar
        </button>
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
function ColorPicker({
  current,
  onPick,
  onClose,
}: {
  current: string | null;
  onPick: (c: TaskColor | null) => void;
  onClose: () => void;
}) {
  return (
    <>
      {/* Capa que cierra al hacer clic fuera, sin necesidad de refs. */}
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div
        role="dialog"
        className="absolute bottom-full left-0 z-30 mb-2 w-max rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
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
    <div
      className={`rounded-lg border border-l-4 border-zinc-300 bg-white p-2.5 shadow-lg dark:border-zinc-600 dark:bg-zinc-800 ${
        TASK_COLORS[resolveColor(todo.color, todo.id)].border
      } ${dragging ? "cursor-grabbing" : ""}`}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-zinc-400">⠿</span>
        <span className="text-sm text-zinc-800 dark:text-zinc-100">{todo.title}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-xs">
        <span className={`size-2 rounded-full ${PRIORITY[todo.priority].dot}`} />
        <span className={PRIORITY[todo.priority].text}>
          {PRIORITY[todo.priority].label}
        </span>
      </div>
    </div>
  );
}
