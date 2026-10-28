CREATE TABLE "data_subject_request_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_subject_request_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"content" "bytea" NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_subject_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"channel" text NOT NULL,
	"full_name" text NOT NULL,
	"national_id" text,
	"birth_date" date,
	"phone" text,
	"email" text,
	"address" text,
	"relationship" text,
	"relationship_detail" text,
	"response_method" text,
	"items" jsonb NOT NULL,
	"description" text,
	"status" text DEFAULT 'new' NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"target_date" date NOT NULL,
	"legal_due_date" date NOT NULL,
	"paused_on" date,
	"paused_days" integer DEFAULT 0 NOT NULL,
	"task_id" uuid,
	"answered_on" date,
	"answer_outcome" text,
	"answer_method" text,
	"answer_summary" text,
	"answer_recorded_at" timestamp with time zone,
	"answer_recorded_by" uuid,
	"ip" text,
	"user_agent" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "request_form_key" text DEFAULT substr(md5(gen_random_uuid()::text), 1, 16) NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "request_form_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "data_subject_request_events" ADD CONSTRAINT "data_subject_request_events_request_id_data_subject_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."data_subject_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_request_events" ADD CONSTRAINT "data_subject_request_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_request_files" ADD CONSTRAINT "data_subject_request_files_request_id_data_subject_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."data_subject_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_request_files" ADD CONSTRAINT "data_subject_request_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_answer_recorded_by_users_id_fk" FOREIGN KEY ("answer_recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_subject_request_events_request_idx" ON "data_subject_request_events" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX "data_subject_request_files_request_idx" ON "data_subject_request_files" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "data_subject_requests_org_number_unique" ON "data_subject_requests" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "data_subject_requests_org_received_idx" ON "data_subject_requests" USING btree ("organization_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_request_form_key_unique" ON "organizations" USING btree ("request_form_key");--> statement-breakpoint
-- İlgili kişi başvuruları yetkileri: Sorumlu rolleri görür ve yönetir, Yönetici görür.
UPDATE "roles" SET "permissions" = "permissions" || ARRAY['requests.read','requests.manage']::text[]
WHERE "is_system" AND "key" IN ('officer_approver', 'kvkk_officer') AND NOT ('requests.read' = ANY("permissions"));--> statement-breakpoint
UPDATE "roles" SET "permissions" = "permissions" || ARRAY['requests.read']::text[]
WHERE "is_system" AND "key" = 'approver' AND NOT ('requests.read' = ANY("permissions"));
