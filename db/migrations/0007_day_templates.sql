CREATE TABLE "day_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"todo_id" integer NOT NULL,
	"subtask_id" integer,
	"hour" real NOT NULL,
	"duration" real DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "template_blocks" ADD CONSTRAINT "template_blocks_template_id_day_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."day_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_blocks" ADD CONSTRAINT "template_blocks_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_blocks" ADD CONSTRAINT "template_blocks_subtask_id_subtasks_id_fk" FOREIGN KEY ("subtask_id") REFERENCES "public"."subtasks"("id") ON DELETE set null ON UPDATE no action;