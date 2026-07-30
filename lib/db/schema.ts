import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  real,
  timestamp,
  date,
} from "drizzle-orm/pg-core";

// Estado de una tarea = columna del tablero Kanban.
export const todoStatus = pgEnum("todo_status", [
  "todo", // Por hacer
  "doing", // En progreso
  "paused", // En pausa
  "done", // Hecho
]);

// Prioridad de una tarea (ordena las tarjetas dentro de cada columna).
export const todoPriority = pgEnum("todo_priority", ["low", "medium", "high"]);

export const todos = pgTable("todos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  status: todoStatus("status").notNull().default("todo"),
  priority: todoPriority("priority").notNull().default("medium"),
  // Color elegido por el usuario para distinguir la tarea en el calendario.
  // Guarda una CLAVE de la paleta de `lib/colors.ts` ("violet", "sky", …), no
  // una clase ni un hex. `null` = automático (derivado del id). Se valida en la
  // API contra la paleta, no con un enum de Postgres: la paleta es presentación
  // y se retoca a menudo; un enum obligaría a una migración por cada color.
  color: text("color"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Subtareas de una tarea. No son tareas: no tienen estado ni prioridad ni color
// propios, solo un título. Existen para etiquetar el DETALLE de un bloque del
// calendario sin romper la tarea madre: el bloque de "Trabajo" de 8 h se parte
// en 4 bloques de 2 h, cada uno con su subtarea, y los 4 siguen siendo
// "Trabajo" (mismo color, misma tarjeta del tablero). Es el modelo de Clockify:
// proyecto → tarea → entrada. Si se borra la tarea, sus subtareas caen con ella.
export const subtasks = pgTable("subtasks", {
  id: serial("id").primaryKey(),
  todoId: integer("todo_id")
    .notNull()
    .references(() => todos.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Bloques del calendario semanal (time-blocking estilo Clockify). Cada bloque
// coloca una tarea en un día y hora concretos y lleva SU PROPIO estado, así una
// misma tarea puede aparecer en varias horas con estados distintos. Si se borra
// la tarea, sus bloques se eliminan en cascada.
export const scheduleBlocks = pgTable("schedule_blocks", {
  id: serial("id").primaryKey(),
  todoId: integer("todo_id")
    .notNull()
    .references(() => todos.id, { onDelete: "cascade" }),
  // Subtarea concreta que se trabaja en este bloque. Opcional: un bloque sin
  // subtarea es la tarea "a secas". `ON DELETE SET NULL` (no cascade) a
  // propósito: borrar una subtarea del catálogo no debe borrarte horas ya
  // agendadas; el bloque se queda como tarea genérica.
  subtaskId: integer("subtask_id").references(() => subtasks.id, {
    onDelete: "set null",
  }),
  date: date("date").notNull(), // 'YYYY-MM-DD' (día concreto)
  // Hora de inicio en horas fraccionarias (paso 0.5 → medias horas): 6.5 = 06:30.
  // Rango 0–23.5.
  hour: real("hour").notNull(),
  // Horas que ocupa, también en pasos de 0.5 (>=0.5). hour + duration <= 24.
  duration: real("duration").notNull().default(1),
  status: todoStatus("status").notNull().default("todo"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Historial del chat. Por ahora una sola conversación global; si más adelante
// quieres múltiples hilos, se añade una tabla `conversations` y un FK aquí.
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type TodoStatus = (typeof todoStatus.enumValues)[number];
export type TodoPriority = (typeof todoPriority.enumValues)[number];

export type Todo = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;
export type Subtask = typeof subtasks.$inferSelect;
export type NewSubtask = typeof subtasks.$inferInsert;
export type ScheduleBlock = typeof scheduleBlocks.$inferSelect;
export type NewScheduleBlock = typeof scheduleBlocks.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
