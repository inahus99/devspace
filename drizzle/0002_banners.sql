ALTER TABLE "workspaces" ALTER COLUMN "color" SET DEFAULT '#1f3550';--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "banner_url" text;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "banner_position" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "banner_url" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "banner_position" integer DEFAULT 50 NOT NULL;