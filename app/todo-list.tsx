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

type Status = "todo" | "doing" | "paused" | "done";
type Priority = "low" | "medium" | "high";

type Todo = {
  id: number;
  title: string;
  status: Status;
  priority: Priority;
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
        const res = await fetch("/api/todos");
        if (!res.ok) throw new Error("No se pudo cargar la lista");
        setTodos((await res.json()) as Todo[]);
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
                editingId={editingId}
                editTitle={editTitle}
                onEditTitleChange={setEditTitle}
                onStartEdit={startEdit}
                onSaveEdit={saveEdit}
                onCancelEdit={() => setEditingId(null)}
                onChangePriority={(id, p) => patch(id, { priority: p })}
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
  editingId,
  editTitle,
  onEditTitleChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onChangePriority,
  onRemove,
  activeId,
}: {
  status: Status;
  label: string;
  accent: string;
  todos: Todo[];
  editingId: number | null;
  editTitle: string;
  onEditTitleChange: (v: string) => void;
  onStartEdit: (t: Todo) => void;
  onSaveEdit: (id: number) => void;
  onCancelEdit: () => void;
  onChangePriority: (id: number, p: Priority) => void;
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
            isEditing={editingId === todo.id}
            editTitle={editTitle}
            onEditTitleChange={onEditTitleChange}
            onStartEdit={onStartEdit}
            onSaveEdit={onSaveEdit}
            onCancelEdit={onCancelEdit}
            onChangePriority={onChangePriority}
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
  isEditing,
  editTitle,
  onEditTitleChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onChangePriority,
  onRemove,
  hidden,
}: {
  todo: Todo;
  isEditing: boolean;
  editTitle: string;
  onEditTitleChange: (v: string) => void;
  onStartEdit: (t: Todo) => void;
  onSaveEdit: (id: number) => void;
  onCancelEdit: () => void;
  onChangePriority: (id: number, p: Priority) => void;
  onRemove: (id: number) => void;
  hidden: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: todo.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: hidden ? 0.4 : 1 }}
      className="group rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800"
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

// Copia visual usada dentro del DragOverlay mientras se arrastra.
function CardBody({ todo, dragging }: { todo: Todo; dragging?: boolean }) {
  return (
    <div
      className={`rounded-lg border border-zinc-300 bg-white p-2.5 shadow-lg dark:border-zinc-600 dark:bg-zinc-800 ${
        dragging ? "cursor-grabbing" : ""
      }`}
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
