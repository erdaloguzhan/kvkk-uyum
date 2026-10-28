CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"notification_type" text DEFAULT 'initial' NOT NULL,
	"parent_id" uuid,
	"follow_up_ref" text,
	"occurred_at" timestamp with time zone,
	"detected_at" timestamp with time zone NOT NULL,
	"form" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approver_id" uuid,
	"task_id" uuid,
	"submitted_at" timestamp with time zone,
	"submitted_by" uuid,
	"decision" text,
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"notified_at" timestamp with time zone,
	"closing_note" text,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incidents_org_number_unique" UNIQUE("organization_id","number")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "incident_id" uuid;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_parent_id_incidents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."incidents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incidents_org_detected_idx" ON "incidents" USING btree ("organization_id","detected_at");--> statement-breakpoint
CREATE INDEX "incidents_status_idx" ON "incidents" USING btree ("status");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Mevcut kuruluşların sabit rollerine veri ihlali yetkilerini ekle (yeni kuruluşlar SYSTEM_ROLES'tan alır).
UPDATE "roles" SET "permissions" = "permissions" || ARRAY['incidents.read', 'incidents.approve']::text[]
WHERE "is_system" AND "key" IN ('officer_approver', 'approver') AND NOT ('incidents.read' = ANY("permissions"));
--> statement-breakpoint
UPDATE "roles" SET "permissions" = array_append("permissions", 'incidents.read')
WHERE "is_system" AND "key" = 'kvkk_officer' AND NOT ('incidents.read' = ANY("permissions"));
