ALTER TABLE "resources" ADD COLUMN "preview_image" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "preview_title" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "preview_description" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "site_name" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "favicon_url" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "preview_fetched_at" timestamp with time zone;