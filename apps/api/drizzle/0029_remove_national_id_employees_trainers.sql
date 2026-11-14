-- Veri minimizasyonu (Erdal, 14.11.2026): çalışan ve eğitimcide T.C. kimlik no tutulmaz; mevcut numaralar silinir.
-- Kuruluş içinde çalışan tekilliği artık cep telefonuyla (aynı kuruluşta bir telefon tek çalışana ait).
DROP INDEX "employees_org_national_id_hash_unique";--> statement-breakpoint
DROP INDEX "trainers_national_id_hash_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "employees_org_phone_unique" ON "employees" USING btree ("organization_id","phone") WHERE "employees"."phone" is not null;--> statement-breakpoint
ALTER TABLE "employees" DROP COLUMN "national_id";--> statement-breakpoint
ALTER TABLE "employees" DROP COLUMN "national_id_hash";--> statement-breakpoint
ALTER TABLE "trainers" DROP COLUMN "national_id";--> statement-breakpoint
ALTER TABLE "trainers" DROP COLUMN "national_id_hash";