CREATE TABLE "schedule_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"todo_id" integer NOT NULL,
	"date" date NOT NULL,
	"hour" integer NOT NULL,
	"status" "todo_status" DEFAULT 'todo' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;