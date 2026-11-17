-- Pilot test (Erdal, 17.11.2026): Sorumlu kendi dokümanını ekleyebilir ve dokümanı listeden çıkarabilir (Yönetici onayıyla).
-- Çıkarılan doküman silinmez (removed_at); onay talepleri artık "publish" (sürüm yayını) veya "remove" (çıkarma) türündedir.
DROP INDEX "documents_org_code_unique";--> statement-breakpoint
ALTER TABLE "approval_requests" ALTER COLUMN "version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD COLUMN "kind" text DEFAULT 'publish' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "removed_by" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "approval_requests_pending_removal_unique" ON "approval_requests" USING btree ("document_id") WHERE "approval_requests"."status" = 'pending' and "approval_requests"."kind" = 'remove';--> statement-breakpoint
CREATE UNIQUE INDEX "documents_org_code_unique" ON "documents" USING btree ("organization_id","code") WHERE "documents"."removed_at" is null;