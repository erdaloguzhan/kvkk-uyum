CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"party_name" text NOT NULL,
	"type" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"description" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contracts_org_status_idx" ON "contracts" USING btree ("organization_id","status");--> statement-breakpoint
-- Mevcut kuruluşların varsayılan rollerine sözleşme yetkilerini ekle (yeni kuruluşlar SYSTEM_ROLES'tan alır).
UPDATE "roles" SET "permissions" = "permissions" || ARRAY['contracts.read']::text[]
WHERE "is_system" AND "key" IN ('org_admin', 'kvkk_officer', 'viewer') AND NOT ('contracts.read' = ANY("permissions"));
