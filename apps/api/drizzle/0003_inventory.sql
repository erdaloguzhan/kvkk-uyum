CREATE TABLE "inventory_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"department" text NOT NULL,
	"activity" text NOT NULL,
	"data_category" text NOT NULL,
	"personal_data" text,
	"special_category_data" text,
	"purposes" text[] DEFAULT '{}'::text[] NOT NULL,
	"storage_medium" text,
	"storage_location" text,
	"data_subject_groups" text[] DEFAULT '{}'::text[] NOT NULL,
	"legal_bases" text[] DEFAULT '{}'::text[] NOT NULL,
	"related_legislation" text,
	"retention_period" text,
	"recipients" text[] DEFAULT '{}'::text[] NOT NULL,
	"foreign_transfers" text,
	"administrative_measures" text[] DEFAULT '{}'::text[] NOT NULL,
	"technical_measures" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_entries" ADD CONSTRAINT "inventory_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_entries" ADD CONSTRAINT "inventory_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_entries" ADD CONSTRAINT "inventory_entries_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_entries_org_department_idx" ON "inventory_entries" USING btree ("organization_id","department");