-- Müşteri rolleri sabitlendi: Sorumlu + Yönetici, Sorumlu, Yönetici (onay), İzleyici. Özel roller kaldırıldı.
-- Eski "Kuruluş Yöneticisi" tüm yetkilere sahipti; aynı yetkilerle "KVKK Sorumlusu + Yönetici" olur.
UPDATE "roles" SET "key" = 'officer_approver', "name" = 'KVKK Sorumlusu + Yönetici',
  "permissions" = ARRAY['org.read','org.manage','users.read','audit.read','documents.read','documents.write','documents.approve','inventory.read','inventory.write','tasks.read','tasks.manage','incidents.manage','contracts.read','contracts.manage','destruction.manage','reports.read']::text[]
WHERE "is_system" AND "key" = 'org_admin';
--> statement-breakpoint
UPDATE "roles" SET "name" = 'KVKK Sorumlusu',
  "permissions" = ARRAY['org.read','org.manage','users.read','audit.read','documents.read','documents.write','inventory.read','inventory.write','tasks.read','tasks.manage','incidents.manage','contracts.read','contracts.manage','destruction.manage','reports.read']::text[]
WHERE "is_system" AND "key" = 'kvkk_officer';
--> statement-breakpoint
UPDATE "roles" SET "name" = 'İzleyici', "permissions" = ARRAY['documents.read']::text[]
WHERE "is_system" AND "key" = 'viewer';
--> statement-breakpoint
INSERT INTO "roles" ("organization_id", "key", "name", "permissions", "is_system")
SELECT "id", 'approver', 'Yönetici', ARRAY['documents.read','documents.approve']::text[], true FROM "organizations"
ON CONFLICT ("organization_id", "key") DO NOTHING;
--> statement-breakpoint
-- Özel role sahip üyeler KVKK Sorumlusu olur, ardından özel roller silinir.
UPDATE "memberships" m SET "role_id" = o."id"
FROM "roles" r, "roles" o
WHERE m."role_id" = r."id" AND NOT r."is_system"
  AND o."organization_id" = r."organization_id" AND o."key" = 'kvkk_officer';
--> statement-breakpoint
DELETE FROM "roles" WHERE NOT "is_system";
