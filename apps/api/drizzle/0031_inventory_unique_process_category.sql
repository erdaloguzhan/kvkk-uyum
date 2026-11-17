-- Pilot test hata 1 (Erdal, 17.11.2026): veri envanterinde aynı departman + faaliyet + veri kategorisi için birden
-- çok satır (mükerrer veri kategorisi) oluşmuştu. Hiyerarşi: Departman 1→N Faaliyet, (Departman, Faaliyet) 1→N Veri
-- kategorisi, (… , Veri kategorisi) 1→N Kişisel veri; diğer sütunlar bu üçlünün tek satırında 1→1.
-- Bu geçiş mevcut mükerrer satırları en eski satırda birleştirir, sonra aynı üçlünün tekrar oluşmasını tekil indeksle engeller.
-- Birleştirmede hiçbir seçim kaybolmaz: çoklu seçimler ve kişisel veriler birleştirilir; tek değerli alanlarda
-- (saklama süresi vb.) en eski dolu değer kalır, farklı değerler işlem kaydına (inventory.duplicates_merged) yazılır.

-- 1) Adlardaki fazla boşluklar temizlenir.
UPDATE "inventory_entries" SET
  "department" = regexp_replace(btrim("department"), '\s+', ' ', 'g'),
  "activity" = regexp_replace(btrim("activity"), '\s+', ' ', 'g'),
  "data_category" = regexp_replace(btrim("data_category"), '\s+', ' ', 'g')
WHERE "department" <> regexp_replace(btrim("department"), '\s+', ' ', 'g')
   OR "activity" <> regexp_replace(btrim("activity"), '\s+', ' ', 'g')
   OR "data_category" <> regexp_replace(btrim("data_category"), '\s+', ' ', 'g');
--> statement-breakpoint
-- 2) Yalnızca büyük/küçük harfle (Türkçe I/ı, İ/i dahil) ayrılan adlar en eski satırdaki yazılışa getirilir (departman, sonra faaliyet, sonra kategori).
UPDATE "inventory_entries" e SET "department" = f."department"
FROM (
  SELECT DISTINCT ON ("organization_id", lower(translate("department", 'İIı', 'iii'))) "organization_id", lower(translate("department", 'İIı', 'iii')) AS k, "department"
  FROM "inventory_entries" ORDER BY "organization_id", lower(translate("department", 'İIı', 'iii')), "created_at", "id"
) f
WHERE e."organization_id" = f."organization_id" AND lower(translate(e."department", 'İIı', 'iii')) = f.k AND e."department" <> f."department";
--> statement-breakpoint
UPDATE "inventory_entries" e SET "activity" = f."activity"
FROM (
  SELECT DISTINCT ON ("organization_id", "department", lower(translate("activity", 'İIı', 'iii'))) "organization_id", "department", lower(translate("activity", 'İIı', 'iii')) AS k, "activity"
  FROM "inventory_entries" ORDER BY "organization_id", "department", lower(translate("activity", 'İIı', 'iii')), "created_at", "id"
) f
WHERE e."organization_id" = f."organization_id" AND e."department" = f."department" AND lower(translate(e."activity", 'İIı', 'iii')) = f.k
  AND e."activity" <> f."activity";
--> statement-breakpoint
UPDATE "inventory_entries" e SET "data_category" = f."data_category"
FROM (
  SELECT DISTINCT ON ("organization_id", "department", "activity", lower(translate("data_category", 'İIı', 'iii')))
    "organization_id", "department", "activity", lower(translate("data_category", 'İIı', 'iii')) AS k, "data_category"
  FROM "inventory_entries" ORDER BY "organization_id", "department", "activity", lower(translate("data_category", 'İIı', 'iii')), "created_at", "id"
) f
WHERE e."organization_id" = f."organization_id" AND e."department" = f."department" AND e."activity" = f."activity"
  AND lower(translate(e."data_category", 'İIı', 'iii')) = f.k AND e."data_category" <> f."data_category";
--> statement-breakpoint
-- 3) Mükerrer satırlar birleştirilir.
DO $$
DECLARE
  g record;
  r record;
  keeper uuid;
  others uuid[];
  no_recipients constant text := 'Bu departman, süreç ve kategoride alıcı gruplarından hiç birine veri aktarılmamaktadır.';
  no_foreign constant text := 'Bu departman, süreç ve veri kategorisinde yurtdışına veri aktarılmamaktadır.';
  v_purposes text[]; v_groups text[]; v_bases text[]; v_recipients text[]; v_admin text[]; v_tech text[];
  v_personal text[]; v_special text[]; v_legislation text[];
  v_retention text[]; v_location text[]; v_medium text[]; v_foreign text[];
  v_foreign_value text;
  conflicts jsonb;
BEGIN
  FOR g IN
    SELECT "organization_id", array_agg("id" ORDER BY "created_at", "id") AS ids
    FROM "inventory_entries"
    GROUP BY "organization_id", "department", "activity", "data_category"
    HAVING count(*) > 1
  LOOP
    keeper := g.ids[1];
    others := g.ids[2:];
    v_purposes := '{}'; v_groups := '{}'; v_bases := '{}'; v_recipients := '{}'; v_admin := '{}'; v_tech := '{}';
    v_personal := '{}'; v_special := '{}'; v_legislation := '{}';
    v_retention := '{}'; v_location := '{}'; v_medium := '{}'; v_foreign := '{}';

    FOR r IN SELECT * FROM "inventory_entries" WHERE "id" = ANY (g.ids) ORDER BY "created_at", "id" LOOP
      v_purposes := v_purposes || r."purposes";
      v_groups := v_groups || r."data_subject_groups";
      v_bases := v_bases || r."legal_bases";
      v_recipients := v_recipients || r."recipients";
      v_admin := v_admin || r."administrative_measures";
      v_tech := v_tech || r."technical_measures";
      v_personal := v_personal || regexp_split_to_array(coalesce(r."personal_data", ''), '[,\n]');
      v_special := v_special || regexp_split_to_array(coalesce(r."special_category_data", ''), '[,\n]');
      v_legislation := v_legislation || string_to_array(coalesce(r."related_legislation", ''), ',');
      v_retention := v_retention || coalesce(nullif(btrim(r."retention_period"), ''), '');
      v_location := v_location || coalesce(nullif(btrim(r."storage_location"), ''), '');
      v_medium := v_medium || coalesce(r."storage_medium", '');
      v_foreign := v_foreign || coalesce(nullif(btrim(r."foreign_transfers"), ''), '');
    END LOOP;

    -- Tekrarlar (boşluk ve büyük/küçük harf farkı yok sayılarak) ilk görüldükleri sırayla bir kez kalır.
    SELECT coalesce(array_agg(v ORDER BY i), '{}') INTO v_purposes FROM (
      SELECT DISTINCT ON (lower(translate(btrim(x), 'İIı', 'iii'))) btrim(x) AS v, i FROM unnest(v_purposes) WITH ORDINALITY t(x, i)
      WHERE btrim(x) <> '' ORDER BY lower(translate(btrim(x), 'İIı', 'iii')), i) s;
    SELECT coalesce(array_agg(v ORDER BY i), '{}') INTO v_groups FROM (
      SELECT DISTINCT ON (lower(translate(btrim(x), 'İIı', 'iii'))) btrim(x) AS v, i FROM unnest(v_groups) WITH ORDINALITY t(x, i)
      WHERE btrim(x) <> '' ORDER BY lower(translate(btrim(x), 'İIı', 'iii')), i) s;
    SELECT coalesce(array_agg(v ORDER BY i), '{}') INTO v_bases FROM (
      SELECT DISTINCT ON (lower(translate(btrim(x), 'İIı', 'iii'))) btrim(x) AS v, i FROM unnest(v_bases) WITH ORDINALITY t(x, i)
      WHERE btrim(x) <> '' ORDER BY lower(translate(btrim(x), 'İIı', 'iii')), i) s;
    SELECT coalesce(array_agg(v ORDER BY i), '{}') INTO v_recipients FROM (
      SELECT DISTINCT ON (lower(translate(btrim(x), 'İIı', 'iii'))) btrim(x) AS v, i FROM unnest(v_recipients) WITH ORDINALITY t(x, i)
      WHERE btrim(x) <> '' ORDER BY lower(translate(btrim(x), 'İIı', 'iii')), i) s;
    SELECT coalesce(array_agg(v ORDER BY i), '{}') INTO v_admin FROM (
      SELECT DISTINCT ON (lower(translate(btrim(x), 'İIı', 'iii'))) btrim(x) AS v, i FROM unnest(v_admin) WITH ORDINALITY t(x, i)
      WHERE btrim(x) <> '' ORDER BY lower(translate(btrim(x), 'İIı', 'iii')), i) s;
    SELECT coalesce(array_agg(v ORDER BY i), '{}') INTO v_tech FROM (
      SELECT DISTINCT ON (lower(translate(btrim(x), 'İIı', 'iii'))) btrim(x) AS v, i FROM unnest(v_tech) WITH ORDINALITY t(x, i)
      WHERE btrim(x) <> '' ORDER BY lower(translate(btrim(x), 'İIı', 'iii')), i) s;
    SELECT coalesce(array_agg(v ORDER BY i), '{}') INTO v_personal FROM (
      SELECT DISTINCT ON (lower(translate(btrim(x), 'İIı', 'iii'))) btrim(x) AS v, i FROM unnest(v_personal) WITH ORDINALITY t(x, i)
      WHERE btrim(x) <> '' ORDER BY lower(translate(btrim(x), 'İIı', 'iii')), i) s;
    SELECT coalesce(array_agg(v ORDER BY i), '{}') INTO v_special FROM (
      SELECT DISTINCT ON (lower(translate(btrim(x), 'İIı', 'iii'))) btrim(x) AS v, i FROM unnest(v_special) WITH ORDINALITY t(x, i)
      WHERE btrim(x) <> '' ORDER BY lower(translate(btrim(x), 'İIı', 'iii')), i) s;
    SELECT coalesce(array_agg(v ORDER BY i), '{}') INTO v_legislation FROM (
      SELECT DISTINCT ON (lower(translate(btrim(x), 'İIı', 'iii'))) btrim(x) AS v, i FROM unnest(v_legislation) WITH ORDINALITY t(x, i)
      WHERE btrim(x) <> '' ORDER BY lower(translate(btrim(x), 'İIı', 'iii')), i) s;
    -- Tek değerli alanların farklı dolu değerleri (ilk eleman en eski satırınki).
    SELECT coalesce(array_agg(x ORDER BY i), '{}') INTO v_retention FROM (
      SELECT DISTINCT ON (x) x, i FROM unnest(v_retention) WITH ORDINALITY t(x, i) WHERE x <> '' ORDER BY x, i) s;
    SELECT coalesce(array_agg(x ORDER BY i), '{}') INTO v_location FROM (
      SELECT DISTINCT ON (x) x, i FROM unnest(v_location) WITH ORDINALITY t(x, i) WHERE x <> '' ORDER BY x, i) s;
    SELECT coalesce(array_agg(x ORDER BY i), '{}') INTO v_medium FROM (
      SELECT DISTINCT ON (x) x, i FROM unnest(v_medium) WITH ORDINALITY t(x, i) WHERE x <> '' ORDER BY x, i) s;
    SELECT coalesce(array_agg(x ORDER BY i), '{}') INTO v_foreign FROM (
      SELECT DISTINCT ON (x) x, i FROM unnest(v_foreign) WITH ORDINALITY t(x, i) WHERE x <> '' ORDER BY x, i) s;

    -- Bir satırda alıcı seçilmişse "hiç birine aktarılmamaktadır" cümlesi kalkar.
    IF EXISTS (SELECT 1 FROM unnest(v_recipients) x WHERE x <> no_recipients) THEN
      v_recipients := array_remove(v_recipients, no_recipients);
    END IF;
    -- Bir satırda yurt dışı aktarım varsa o kalır (aktarım olmadığı cümlesi yerine).
    SELECT x INTO v_foreign_value FROM unnest(v_foreign) WITH ORDINALITY t(x, i) WHERE x <> no_foreign ORDER BY i LIMIT 1;
    IF v_foreign_value IS NULL AND no_foreign = ANY (v_foreign) THEN v_foreign_value := no_foreign; END IF;

    conflicts := '{}'::jsonb;
    IF cardinality(v_retention) > 1 THEN conflicts := conflicts || jsonb_build_object('retentionPeriod', to_jsonb(v_retention)); END IF;
    IF cardinality(v_location) > 1 THEN conflicts := conflicts || jsonb_build_object('storageLocation', to_jsonb(v_location)); END IF;
    IF cardinality(v_medium) > 1 THEN conflicts := conflicts || jsonb_build_object('storageMedium', to_jsonb(v_medium)); END IF;
    IF cardinality(array_remove(v_foreign, no_foreign)) > 1 THEN
      conflicts := conflicts || jsonb_build_object('foreignTransfers', to_jsonb(v_foreign));
    END IF;

    UPDATE "inventory_entries" SET
      "purposes" = v_purposes,
      "data_subject_groups" = v_groups,
      "legal_bases" = v_bases,
      "recipients" = v_recipients,
      "administrative_measures" = v_admin,
      "technical_measures" = v_tech,
      "personal_data" = nullif(array_to_string(v_personal, ', '), ''),
      "special_category_data" = nullif(array_to_string(v_special, ', '), ''),
      "related_legislation" = nullif(array_to_string(v_legislation, ', '), ''),
      "retention_period" = v_retention[1],
      "storage_location" = v_location[1],
      "storage_medium" = v_medium[1],
      "foreign_transfers" = v_foreign_value,
      "updated_at" = now()
    WHERE "id" = keeper;

    -- Silinecek satırlara bağlı görevler ve imha kayıtları birleşen satıra taşınır.
    UPDATE "tasks" SET "entity_id" = keeper WHERE "entity_type" = 'inventory_entry' AND "entity_id" = ANY (others);
    UPDATE "destruction_items" SET "inventory_entry_id" = keeper WHERE "inventory_entry_id" = ANY (others);
    UPDATE "destruction_records" SET "inventory_entry_id" = keeper WHERE "inventory_entry_id" = ANY (others);

    INSERT INTO "audit_logs" ("organization_id", "action", "entity_type", "entity_id", "metadata")
    SELECT g."organization_id", 'inventory.duplicates_merged', 'inventory_entry', keeper::text,
      jsonb_build_object(
        'department', e."department", 'activity', e."activity", 'dataCategory', e."data_category",
        'mergedIds', to_jsonb(others), 'conflicts', conflicts
      )
    FROM "inventory_entries" e WHERE e."id" = keeper;

    DELETE FROM "inventory_entries" WHERE "id" = ANY (others);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_entries_org_process_category_unique" ON "inventory_entries" USING btree ("organization_id",lower(translate("department", 'İIı', 'iii')),lower(translate("activity", 'İIı', 'iii')),lower(translate("data_category", 'İIı', 'iii')));
