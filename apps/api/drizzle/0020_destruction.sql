CREATE TABLE "destruction_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"inventory_entry_id" uuid,
	"data_description" text NOT NULL,
	"storage_medium" text,
	"retention_period" text,
	"planned_date" date NOT NULL,
	"operation_type" text NOT NULL,
	"method" text,
	"officer_id" uuid,
	"officer_name" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"cancel_reason" text,
	"task_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "destruction_officers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid,
	"full_name" text NOT NULL,
	"title" text,
	"start_date" date NOT NULL,
	"end_date" date,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "destruction_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"approver_id" uuid,
	"approval_task_id" uuid,
	"requested_by" uuid,
	"requested_at" timestamp with time zone,
	"request_note" text,
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "destruction_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"item_id" uuid,
	"plan_id" uuid,
	"plan_title" text,
	"inventory_entry_id" uuid,
	"data_description" text NOT NULL,
	"storage_medium" text,
	"planned_date" date,
	"performed_date" date NOT NULL,
	"operation_type" text NOT NULL,
	"performed_note" text NOT NULL,
	"officer_id" uuid,
	"officer_name" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "destruction_period_months" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "destruction_items" ADD CONSTRAINT "destruction_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destruction_items" ADD CONSTRAINT "destruction_items_plan_id_destruction_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."destruction_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destruction_items" ADD CONSTRAINT "destruction_items_inventory_entry_id_inventory_entries_id_fk" FOREIGN KEY ("inventory_entry_id") REFERENCES "public"."inventory_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destruction_items" ADD CONSTRAINT "destruction_items_officer_id_destruction_officers_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."destruction_officers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destruction_items" ADD CONSTRAINT "destruction_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destruction_items" ADD CONSTRAINT "destruction_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destruction_officers" ADD CONSTRAINT "destruction_officers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destruction_officers" ADD CONSTRAINT "destruction_officers_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destruction_officers" ADD CONSTRAINT "destruction_officers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destruction_plans" ADD CONSTRAINT "destruction_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destruction_plans" ADD CONSTRAINT "destruction_plans_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destruction_plans" ADD CONSTRAINT "destruction_plans_approval_task_id_tasks_id_fk" FOREIGN KEY ("approval_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destruction_plans" ADD CONSTRAINT "destruction_plans_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destruction_plans" ADD CONSTRAINT "destruction_plans_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destruction_plans" ADD CONSTRAINT "destruction_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destruction_records" ADD CONSTRAINT "destruction_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destruction_records" ADD CONSTRAINT "destruction_records_item_id_destruction_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."destruction_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destruction_records" ADD CONSTRAINT "destruction_records_plan_id_destruction_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."destruction_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destruction_records" ADD CONSTRAINT "destruction_records_inventory_entry_id_inventory_entries_id_fk" FOREIGN KEY ("inventory_entry_id") REFERENCES "public"."inventory_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destruction_records" ADD CONSTRAINT "destruction_records_officer_id_destruction_officers_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."destruction_officers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destruction_records" ADD CONSTRAINT "destruction_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "destruction_items_plan_idx" ON "destruction_items" USING btree ("plan_id","planned_date");--> statement-breakpoint
CREATE INDEX "destruction_officers_org_start_idx" ON "destruction_officers" USING btree ("organization_id","start_date");--> statement-breakpoint
CREATE INDEX "destruction_plans_org_period_idx" ON "destruction_plans" USING btree ("organization_id","period_start");--> statement-breakpoint
CREATE INDEX "destruction_records_org_date_idx" ON "destruction_records" USING btree ("organization_id","performed_date");--> statement-breakpoint
CREATE UNIQUE INDEX "destruction_records_item_unique" ON "destruction_records" USING btree ("item_id");--> statement-breakpoint
-- İmha yönetimi yetkileri: Sorumlu imha kayıtlarını görür ve yönetir, Yönetici görür ve imha planlarını onaylar.
UPDATE "roles" SET "permissions" = array_append("permissions", 'destruction.read')
WHERE "is_system" AND "key" IN ('officer_approver', 'kvkk_officer', 'approver') AND NOT ('destruction.read' = ANY("permissions"));
--> statement-breakpoint
UPDATE "roles" SET "permissions" = array_append("permissions", 'destruction.approve')
WHERE "is_system" AND "key" IN ('officer_approver', 'approver') AND NOT ('destruction.approve' = ANY("permissions"));
