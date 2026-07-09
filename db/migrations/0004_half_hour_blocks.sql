ALTER TABLE "schedule_blocks" ALTER COLUMN "hour" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "schedule_blocks" ALTER COLUMN "duration" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "schedule_blocks" ALTER COLUMN "duration" SET DEFAULT 1;