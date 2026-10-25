-- Cep telefonu Eğitim Portalı kullanıcı adı oldu: kayıtlı numaralar 05XXXXXXXXX biçimine getirilir
-- (boşluk, tire, nokta, parantez atılır; +90 / 90 / 0090 ön eki ve baştaki sıfırı düşmüş 5XXXXXXXXX düzeltilir).
-- Türkiye cep telefonu olarak tanınmayan numaralar olduğu gibi kalır.
UPDATE "employees" SET "phone" = n.phone
FROM (
  SELECT id,
    CASE
      WHEN d ~ '^0090[0-9]{10}$' THEN '0' || substr(d, 5)
      WHEN d ~ '^90[0-9]{10}$' THEN '0' || substr(d, 3)
      WHEN d ~ '^5[0-9]{9}$' THEN '0' || d
      ELSE d
    END AS phone
  FROM (SELECT id, regexp_replace(regexp_replace("phone", '[[:space:]().\-/]', '', 'g'), '^\+', '') AS d FROM "employees" WHERE "phone" IS NOT NULL) raw
) n
WHERE "employees".id = n.id AND n.phone ~ '^05[0-9]{9}$';--> statement-breakpoint
CREATE INDEX "employees_phone_idx" ON "employees" USING btree ("phone");
