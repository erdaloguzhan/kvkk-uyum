CREATE TABLE "portal_login_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "training_account_tokens" CASCADE;--> statement-breakpoint
DROP TABLE "training_accounts" CASCADE;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
CREATE INDEX "portal_login_codes_phone_idx" ON "portal_login_codes" USING btree ("phone","created_at");--> statement-breakpoint
-- Eğitimcinin kayıtlı cep telefonu, giriş doğrulama kodunun gideceği numara olur.
UPDATE "users" u SET "phone" = t."phone" FROM "trainers" t WHERE t."user_id" = u."id" AND t."phone" IS NOT NULL;