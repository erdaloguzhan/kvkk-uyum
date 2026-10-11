ALTER TABLE "contracts" ALTER COLUMN "type" DROP NOT NULL;--> statement-breakpoint
-- Eski türler kaldırıldı. Yalnızca karşılığı açık olan "Çalışan" -> "Çalışan İş Sözleşmesi" aktarılır;
-- Tedarikçi, Müşteri ve Kamu kurumu kayıtlarının türü boş bırakılır ve kullanıcı yeniden seçer.
UPDATE "contracts" SET "type" = 'employment' WHERE "type" = 'employee';--> statement-breakpoint
UPDATE "contracts" SET "type" = NULL WHERE "type" IN ('supplier', 'customer', 'public_institution');
