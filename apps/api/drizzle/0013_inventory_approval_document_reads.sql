CREATE TABLE "document_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"ip" text,
	"user_agent" text,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"task_id" uuid,
	"requested_by" uuid,
	"approver_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"decision_note" text,
	"snapshot" jsonb NOT NULL,
	"changes" jsonb NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_reads" ADD CONSTRAINT "document_reads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_reads" ADD CONSTRAINT "document_reads_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_reads" ADD CONSTRAINT "document_reads_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_reads" ADD CONSTRAINT "document_reads_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_approvals" ADD CONSTRAINT "inventory_approvals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_approvals" ADD CONSTRAINT "inventory_approvals_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_approvals" ADD CONSTRAINT "inventory_approvals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_approvals" ADD CONSTRAINT "inventory_approvals_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_approvals" ADD CONSTRAINT "inventory_approvals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_reads_version_employee_unique" ON "document_reads" USING btree ("version_id","employee_id");--> statement-breakpoint
CREATE INDEX "document_reads_document_idx" ON "document_reads" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_approvals_pending_org_unique" ON "inventory_approvals" USING btree ("organization_id") WHERE "inventory_approvals"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "inventory_approvals_org_created_idx" ON "inventory_approvals" USING btree ("organization_id","created_at");--> statement-breakpoint
-- Yönetici artık veri envanteri değişikliklerini de onaylar ve görev atar (envanter onayı için yeni yetki: inventory.approve).
UPDATE "roles" SET "permissions" = array_append("permissions", 'inventory.approve')
WHERE "is_system" AND "key" = 'officer_approver' AND NOT ('inventory.approve' = ANY("permissions"));
--> statement-breakpoint
UPDATE "roles" SET "permissions" = ARRAY['documents.read','documents.approve','inventory.read','inventory.approve','tasks.read','tasks.manage','users.read']::text[]
WHERE "is_system" AND "key" = 'approver';
