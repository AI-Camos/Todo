import { pgTable, pgEnum, serial, text, timestamp } from "drizzle-orm/pg-core";

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
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
