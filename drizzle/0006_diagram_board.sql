ALTER TABLE "diagrams" ADD COLUMN "kind" text DEFAULT 'drawing' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "diagrams_board_folder_idx" ON "diagrams" USING btree ("folder_id") WHERE "diagrams"."kind" = 'board';--> statement-breakpoint
ALTER TABLE "diagrams" ADD CONSTRAINT "diagrams_kind_valid" CHECK ("diagrams"."kind" in ('drawing', 'board'));