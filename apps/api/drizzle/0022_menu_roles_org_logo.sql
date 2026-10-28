ALTER TABLE "organizations" ADD COLUMN "logo" "bytea";--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "logo_mime" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "logo_updated_at" timestamp with time zone;--> statement-breakpoint
-- Yönetici menüsü (Erdal'ın çizimi, 28.10.2026): Kuruluş Bilgileri (sadece okuma) ve İşlem Kayıtları.
UPDATE "roles" SET "permissions" = "permissions" || ARRAY['org.read']::text[]
WHERE "is_system" AND "key" = 'approver' AND NOT ('org.read' = ANY("permissions"));--> statement-breakpoint
UPDATE "roles" SET "permissions" = "permissions" || ARRAY['audit.read']::text[]
WHERE "is_system" AND "key" = 'approver' AND NOT ('audit.read' = ANY("permissions"));
