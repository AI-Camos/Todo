CREATE TYPE "public"."todo_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."todo_status" AS ENUM('todo', 'doing', 'paused', 'done');--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "status" "todo_status" DEFAULT 'todo' NOT NULL;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "priority" "todo_priority" DEFAULT 'medium' NOT NULL;--> statement-breakpoint
UPDATE "todos" SET "status" = 'done' WHERE "completed" = true;--> statement-breakpoint
ALTER TABLE "todos" DROP COLUMN "completed";
