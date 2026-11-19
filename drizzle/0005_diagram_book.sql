ALTER TABLE "diagrams" ADD COLUMN "book_id" uuid;--> statement-breakpoint
ALTER TABLE "diagrams" ADD CONSTRAINT "diagrams_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diagrams_book_idx" ON "diagrams" USING btree ("book_id");