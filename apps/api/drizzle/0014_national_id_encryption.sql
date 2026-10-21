-- T.C. kimlik no şifrelenir; tekillik anahtarlı özet (national_id_hash) üzerinden sağlanır.
-- Mevcut kayıtlar şifreleme anahtarı gerektirdiği için SQL ile değil, migrate.ts'teki
-- encryptNationalIds() ile şifrelenir; sütun o adımın sonunda NOT NULL yapılır.
DROP INDEX "employees_org_national_id_unique";--> statement-breakpoint
DROP INDEX "trainers_national_id_unique";--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "national_id_hash" text;--> statement-breakpoint
ALTER TABLE "trainers" ADD COLUMN "national_id_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "employees_org_national_id_hash_unique" ON "employees" USING btree ("organization_id","national_id_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "trainers_national_id_hash_unique" ON "trainers" USING btree ("national_id_hash");
