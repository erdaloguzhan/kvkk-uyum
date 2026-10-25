ALTER TABLE "trainings" DROP CONSTRAINT "trainings_trainer_id_trainers_id_fk";
--> statement-breakpoint
ALTER TABLE "training_groups" ADD COLUMN "trainer_id" uuid;--> statement-breakpoint
ALTER TABLE "training_groups" ADD CONSTRAINT "training_groups_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Eğitimci eğitimden gruba taşındı: mevcut grupların eğitimcisi, eğitimlerinin eğitimcisi olur.
UPDATE "training_groups" g SET "trainer_id" = t."trainer_id" FROM "trainings" t WHERE t."id" = g."training_id";--> statement-breakpoint
ALTER TABLE "trainings" DROP COLUMN "trainer_id";