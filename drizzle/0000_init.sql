CREATE TYPE "public"."attachment_kind" AS ENUM('image', 'pdf', 'file');--> statement-breakpoint
CREATE TYPE "public"."book_status" AS ENUM('want_to_read', 'reading', 'completed', 'paused', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."dsa_difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TYPE "public"."dsa_status" AS ENUM('todo', 'attempted', 'solved', 'needs_revision', 'mastered');--> statement-breakpoint
CREATE TYPE "public"."lld_status" AS ENUM('todo', 'in_progress', 'completed', 'needs_revision');--> statement-breakpoint
CREATE TYPE "public"."note_format" AS ENUM('rich', 'markdown');--> statement-breakpoint
CREATE TYPE "public"."resource_status" AS ENUM('unread', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."resource_type" AS ENUM('youtube', 'twitter', 'github', 'docs', 'article', 'course', 'pdf', 'other');--> statement-breakpoint
CREATE TYPE "public"."workspace_kind" AS ENUM('general', 'dsa', 'lld');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"date" date NOT NULL,
	"start_time" time,
	"end_time" time,
	"planned_minutes" integer DEFAULT 0 NOT NULL,
	"actual_minutes" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"notes" text DEFAULT '' NOT NULL,
	"note_id" uuid,
	"snippet_id" uuid,
	"dsa_problem_id" uuid,
	"lld_exercise_id" uuid,
	"resource_id" uuid,
	"book_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_minutes_valid" CHECK ("activities"."planned_minutes" >= 0 AND "activities"."actual_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid,
	"folder_id" uuid,
	"note_id" uuid,
	"dsa_problem_id" uuid,
	"lld_exercise_id" uuid,
	"book_id" uuid,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"kind" "attachment_kind" NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "book_highlights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"content" text NOT NULL,
	"page" integer,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid,
	"title" text NOT NULL,
	"author" text DEFAULT '' NOT NULL,
	"cover_url" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"total_pages" integer DEFAULT 0 NOT NULL,
	"current_page" integer DEFAULT 0 NOT NULL,
	"status" "book_status" DEFAULT 'want_to_read' NOT NULL,
	"started_on" date,
	"completed_on" date,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "books_pages_valid" CHECK ("books"."total_pages" >= 0 AND "books"."current_page" >= 0)
);
--> statement-breakpoint
CREATE TABLE "code_snippets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"folder_id" uuid,
	"note_id" uuid,
	"dsa_problem_id" uuid,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"language" text DEFAULT 'typescript' NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"note_id" uuid,
	"snippet_id" uuid,
	"resource_id" uuid,
	"dsa_problem_id" uuid,
	"lld_exercise_id" uuid,
	"book_id" uuid,
	CONSTRAINT "content_tags_one_target" CHECK (num_nonnulls("content_tags"."note_id", "content_tags"."snippet_id", "content_tags"."resource_id", "content_tags"."dsa_problem_id", "content_tags"."lld_exercise_id", "content_tags"."book_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "dsa_problems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"folder_id" uuid,
	"title" text NOT NULL,
	"platform" text DEFAULT '' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"topic" text DEFAULT '' NOT NULL,
	"difficulty" "dsa_difficulty" DEFAULT 'medium' NOT NULL,
	"status" "dsa_status" DEFAULT 'todo' NOT NULL,
	"attempted_on" date,
	"solved_on" date,
	"approach" text DEFAULT '' NOT NULL,
	"time_complexity" text DEFAULT '' NOT NULL,
	"space_complexity" text DEFAULT '' NOT NULL,
	"pseudocode" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"last_reviewed_on" date,
	"next_review_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dsa_solutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"problem_id" uuid NOT NULL,
	"title" text DEFAULT 'Solution' NOT NULL,
	"language" text DEFAULT 'cpp' NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"time_complexity" text DEFAULT '' NOT NULL,
	"space_complexity" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "folders_not_own_parent" CHECK ("folders"."parent_id" IS NULL OR "folders"."parent_id" <> "folders"."id")
);
--> statement-breakpoint
CREATE TABLE "lld_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"folder_id" uuid,
	"title" text NOT NULL,
	"status" "lld_status" DEFAULT 'todo' NOT NULL,
	"difficulty" "dsa_difficulty",
	"problem_statement" text DEFAULT '' NOT NULL,
	"functional_requirements" text DEFAULT '' NOT NULL,
	"non_functional_requirements" text DEFAULT '' NOT NULL,
	"entities" text DEFAULT '' NOT NULL,
	"diagram_source" text DEFAULT '' NOT NULL,
	"design_patterns" text[] DEFAULT '{}'::text[] NOT NULL,
	"solid_principles" text[] DEFAULT '{}'::text[] NOT NULL,
	"implementation_language" text DEFAULT 'java' NOT NULL,
	"implementation_code" text DEFAULT '' NOT NULL,
	"trade_offs" text DEFAULT '' NOT NULL,
	"interview_notes" text DEFAULT '' NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"completed_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"folder_id" uuid,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"format" "note_format" DEFAULT 'rich' NOT NULL,
	"content_json" jsonb,
	"content_html" text DEFAULT '' NOT NULL,
	"content_markdown" text DEFAULT '' NOT NULL,
	"plain_text" text DEFAULT '' NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reading_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"logged_on" date NOT NULL,
	"from_page" integer NOT NULL,
	"to_page" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid,
	"folder_id" uuid,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" "resource_type" DEFAULT 'other' NOT NULL,
	"status" "resource_status" DEFAULT 'unread' NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_deletions" (
	"storage_key" text PRIMARY KEY NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon" text DEFAULT 'folder' NOT NULL,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"kind" "workspace_kind" DEFAULT 'general' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_snippet_id_code_snippets_id_fk" FOREIGN KEY ("snippet_id") REFERENCES "public"."code_snippets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_dsa_problem_id_dsa_problems_id_fk" FOREIGN KEY ("dsa_problem_id") REFERENCES "public"."dsa_problems"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_lld_exercise_id_lld_exercises_id_fk" FOREIGN KEY ("lld_exercise_id") REFERENCES "public"."lld_exercises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_dsa_problem_id_dsa_problems_id_fk" FOREIGN KEY ("dsa_problem_id") REFERENCES "public"."dsa_problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_lld_exercise_id_lld_exercises_id_fk" FOREIGN KEY ("lld_exercise_id") REFERENCES "public"."lld_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_highlights" ADD CONSTRAINT "book_highlights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_highlights" ADD CONSTRAINT "book_highlights_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_snippets" ADD CONSTRAINT "code_snippets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_snippets" ADD CONSTRAINT "code_snippets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_snippets" ADD CONSTRAINT "code_snippets_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_snippets" ADD CONSTRAINT "code_snippets_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_snippets" ADD CONSTRAINT "code_snippets_dsa_problem_id_dsa_problems_id_fk" FOREIGN KEY ("dsa_problem_id") REFERENCES "public"."dsa_problems"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_tags" ADD CONSTRAINT "content_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_tags" ADD CONSTRAINT "content_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_tags" ADD CONSTRAINT "content_tags_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_tags" ADD CONSTRAINT "content_tags_snippet_id_code_snippets_id_fk" FOREIGN KEY ("snippet_id") REFERENCES "public"."code_snippets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_tags" ADD CONSTRAINT "content_tags_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_tags" ADD CONSTRAINT "content_tags_dsa_problem_id_dsa_problems_id_fk" FOREIGN KEY ("dsa_problem_id") REFERENCES "public"."dsa_problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_tags" ADD CONSTRAINT "content_tags_lld_exercise_id_lld_exercises_id_fk" FOREIGN KEY ("lld_exercise_id") REFERENCES "public"."lld_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_tags" ADD CONSTRAINT "content_tags_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsa_problems" ADD CONSTRAINT "dsa_problems_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsa_problems" ADD CONSTRAINT "dsa_problems_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsa_problems" ADD CONSTRAINT "dsa_problems_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsa_solutions" ADD CONSTRAINT "dsa_solutions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dsa_solutions" ADD CONSTRAINT "dsa_solutions_problem_id_dsa_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."dsa_problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_id_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lld_exercises" ADD CONSTRAINT "lld_exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lld_exercises" ADD CONSTRAINT "lld_exercises_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lld_exercises" ADD CONSTRAINT "lld_exercises_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_logs" ADD CONSTRAINT "reading_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_logs" ADD CONSTRAINT "reading_logs_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_user_date_idx" ON "activities" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "activities_workspace_date_idx" ON "activities" USING btree ("workspace_id","date");--> statement-breakpoint
CREATE INDEX "attachments_user_idx" ON "attachments" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "attachments_workspace_idx" ON "attachments" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "attachments_note_idx" ON "attachments" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "attachments_dsa_idx" ON "attachments" USING btree ("dsa_problem_id");--> statement-breakpoint
CREATE INDEX "attachments_lld_idx" ON "attachments" USING btree ("lld_exercise_id");--> statement-breakpoint
CREATE INDEX "attachments_book_idx" ON "attachments" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "book_highlights_book_idx" ON "book_highlights" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "books_user_status_idx" ON "books" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "code_snippets_user_updated_idx" ON "code_snippets" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "code_snippets_workspace_folder_idx" ON "code_snippets" USING btree ("workspace_id","folder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_tags_note_uq" ON "content_tags" USING btree ("tag_id","note_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_tags_snippet_uq" ON "content_tags" USING btree ("tag_id","snippet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_tags_resource_uq" ON "content_tags" USING btree ("tag_id","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_tags_dsa_uq" ON "content_tags" USING btree ("tag_id","dsa_problem_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_tags_lld_uq" ON "content_tags" USING btree ("tag_id","lld_exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_tags_book_uq" ON "content_tags" USING btree ("tag_id","book_id");--> statement-breakpoint
CREATE INDEX "content_tags_note_idx" ON "content_tags" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "content_tags_snippet_idx" ON "content_tags" USING btree ("snippet_id");--> statement-breakpoint
CREATE INDEX "content_tags_resource_idx" ON "content_tags" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "content_tags_dsa_idx" ON "content_tags" USING btree ("dsa_problem_id");--> statement-breakpoint
CREATE INDEX "content_tags_lld_idx" ON "content_tags" USING btree ("lld_exercise_id");--> statement-breakpoint
CREATE INDEX "content_tags_book_idx" ON "content_tags" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "dsa_problems_user_status_idx" ON "dsa_problems" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "dsa_problems_workspace_idx" ON "dsa_problems" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "dsa_problems_next_review_idx" ON "dsa_problems" USING btree ("user_id","next_review_on");--> statement-breakpoint
CREATE INDEX "dsa_solutions_problem_idx" ON "dsa_solutions" USING btree ("problem_id","position");--> statement-breakpoint
CREATE INDEX "folders_workspace_parent_idx" ON "folders" USING btree ("workspace_id","parent_id","position");--> statement-breakpoint
CREATE INDEX "folders_user_idx" ON "folders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lld_exercises_user_idx" ON "lld_exercises" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "lld_exercises_workspace_folder_idx" ON "lld_exercises" USING btree ("workspace_id","folder_id");--> statement-breakpoint
CREATE INDEX "notes_user_updated_idx" ON "notes" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "notes_workspace_folder_idx" ON "notes" USING btree ("workspace_id","folder_id");--> statement-breakpoint
CREATE INDEX "reading_logs_user_date_idx" ON "reading_logs" USING btree ("user_id","logged_on");--> statement-breakpoint
CREATE INDEX "reading_logs_book_idx" ON "reading_logs" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "resources_user_created_idx" ON "resources" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "resources_workspace_folder_idx" ON "resources" USING btree ("workspace_id","folder_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_name_idx" ON "tags" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "workspaces_user_position_idx" ON "workspaces" USING btree ("user_id","position");