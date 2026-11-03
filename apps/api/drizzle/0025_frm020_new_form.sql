ALTER TABLE "incidents" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
-- FRM-020'nin yeni haline geçiş: mevcut kayıtların form cevapları yeni sorulara taşınır, kaldırılan soruların
-- cevapları en yakın yeni alana açıklama olarak eklenir (bilgi kaybolmaz).
DO $$
DECLARE
  r record;
  f jsonb;
  src text[];
  cyb text[];
  notes text[];
  effect_notes text[];
  groups text[];
  group_notes text[];
  cats text[];
  notice text;
  notice_detail text;
  after_text text;
  o record;
BEGIN
  FOR r IN SELECT id, organization_id, status, form FROM incidents LOOP
    f := r.form;
    IF f ? 'cyberSources' THEN CONTINUE; END IF;

    -- 14) Kaynak: iki sütun; listede olmayanlar "Diğer" + açıklama
    src := '{}'; cyb := '{}'; notes := '{}';
    IF f->>'description' IS NOT NULL AND f->>'description' <> '' THEN notes := notes || (f->>'description'); END IF;
    FOR o IN SELECT value AS v FROM jsonb_array_elements_text(COALESCE(f->'sources', '[]'::jsonb)) LOOP
      IF o.v IN ('Belge/cihaz hırsızlığı veya kaybolması', 'Verilerin güvensiz ortamlarda depolanması', 'Sabotaj', 'Kaza/ İhmal') THEN
        src := src || o.v;
      ELSIF o.v IN ('Zararlı yazılımlar', 'Sosyal mühendislik') THEN
        cyb := cyb || o.v;
      ELSE
        IF NOT 'Diğer' = ANY(src) THEN src := src || 'Diğer'::text; END IF;
        notes := notes || ('Kaynak: ' || o.v);
      END IF;
    END LOOP;
    IF COALESCE(f->>'sourceOther', '') <> '' THEN
      IF NOT 'Diğer' = ANY(src) THEN src := src || 'Diğer'::text; END IF;
      notes := notes || ('Kaynak (diğer): ' || (f->>'sourceOther'));
    END IF;

    -- 15) İhlal etkisi: eski siber saldırı unsurları ve olası sonuç açıklamaları
    effect_notes := '{}';
    IF COALESCE(f->>'cyberElementOther', '') <> '' THEN effect_notes := effect_notes || (f->>'cyberElementOther'); END IF;
    IF COALESCE(f->>'potentialEffects', '') <> '' THEN effect_notes := effect_notes || ('Potansiyel etkiler: ' || (f->>'potentialEffects')); END IF;
    IF COALESCE(f->>'likelihoodDetail', '') <> '' THEN effect_notes := effect_notes || ('Olasılık açıklaması: ' || (f->>'likelihoodDetail')); END IF;

    -- 17) Kategoriler: "Diğer" artık seçenek
    cats := ARRAY(SELECT jsonb_array_elements_text(COALESCE(f->'personalCategories', '[]'::jsonb)));
    IF COALESCE(f->>'categoryOther', '') <> '' THEN cats := cats || 'Diğer'::text; END IF;

    -- 19) Kişi grupları
    groups := '{}'; group_notes := '{}';
    IF COALESCE(f->>'subjectGroupOther', '') <> '' THEN group_notes := group_notes || (f->>'subjectGroupOther'); END IF;
    FOR o IN SELECT value AS v FROM jsonb_array_elements_text(COALESCE(f->'subjectGroups', '[]'::jsonb)) LOOP
      IF o.v = 'Müşteriler ve potansiyel Müşteriler' THEN groups := groups || 'Müşteriler ve potansiyel müşteriler'::text;
      ELSIF o.v = 'Korunmaya muhtaç yetişkinler' THEN group_notes := group_notes || o.v;
      ELSE groups := groups || o.v;
      END IF;
    END LOOP;

    -- 21) İlgili kişilere bildirim: üç seçenek
    notice := f->>'subjectNotice'; notice_detail := NULL;
    IF notice = 'no_already_aware' THEN notice := 'no'; notice_detail := 'Hayır, zaten bilgileri var';
    ELSIF notice = 'no_will_notify' THEN notice := 'no'; notice_detail := 'Hayır, ancak bildirilecek';
    ELSIF notice = 'other' THEN notice := NULL; notice_detail := 'Diğer';
    ELSIF notice NOT IN ('yes', 'in_progress') THEN notice := NULL;
    END IF;

    -- 31) İhlal sonrası tedbirler + eski "tekrarlanmaması için atılan adımlar"
    after_text := NULLIF(concat_ws(E'\n', NULLIF(f->>'measuresAfter', ''),
      CASE WHEN COALESCE(f->>'recurrenceSteps', '') <> '' THEN 'Tekrarlanmaması için atılan adımlar: ' || (f->>'recurrenceSteps') END), '');

    f := (f - ARRAY['sourceOther', 'categoryOther', 'potentialEffects', 'likelihoodDetail', 'orgRecovery', 'cyberAttack',
                    'cyberElements', 'cyberElementOther', 'cyberImpact', 'cyberRecovery', 'staffTrained', 'recurrenceSteps'])
      || jsonb_build_object(
        'controllerWebsite', NULL, 'controllerEmail', NULL, 'controllerTaxId', NULL, 'controllerKep', NULL, 'controllerUets', NULL,
        'preparerAddress', NULL,
        'processorName', NULL, 'processorAddress', NULL, 'processorDetectedAt', NULL, 'processorNotifiedAt', NULL,
        'sources', to_jsonb(src),
        'cyberSources', to_jsonb(cyb),
        'description', NULLIF(array_to_string(notes, E'\n'), ''),
        'breachEffects', COALESCE((
          SELECT jsonb_agg(CASE WHEN e = 'Veriye erişim' THEN 'Veriye erişim/ulaşılabilirlik' ELSE e END)
          FROM jsonb_array_elements_text(COALESCE(r.form->'cyberElements', '[]'::jsonb)) AS e
          WHERE e IN ('Veri gizliliği', 'Veri bütünlüğü', 'Veriye erişim')), '[]'::jsonb),
        'breachEffectDetail', NULLIF(array_to_string(effect_notes, E'\n'), ''),
        'detectionMethod', NULL,
        'personalCategories', to_jsonb(cats),
        'categoryDetail', NULLIF(f->>'categoryOther', ''),
        'countNote', NULL,
        'subjectGroups', to_jsonb(groups),
        'subjectGroupOther', NULLIF(array_to_string(group_notes, ', '), ''),
        'subjectNotice', notice,
        'subjectNoticeDetail', notice_detail,
        'subjectNoticeDate', NULL,
        'staffTrainings', CASE (f->>'staffTrained')
          WHEN 'true' THEN 'Son bir yıl içinde kişisel veri koruma eğitimi alındı.'
          WHEN 'false' THEN 'Son bir yıl içinde kişisel veri koruma eğitimi alınmadı.' END,
        'measuresBeforeTechnical', NULL, 'measuresBeforeAdministrative', NULL,
        'measuresAfterTechnical', NULL, 'measuresAfterAdministrative', NULL,
        'measuresAfter', after_text
      );

    -- Hazırlanan kayıtlarda yeni A bölümü alanları kuruluş bilgilerinden doldurulur.
    IF r.status = 'draft' THEN
      SELECT website, email, tax_number, kep_address INTO o FROM organizations WHERE id = r.organization_id;
      f := f || jsonb_build_object('controllerWebsite', o.website, 'controllerEmail', o.email,
                                   'controllerTaxId', o.tax_number, 'controllerKep', o.kep_address);
    END IF;

    UPDATE incidents SET form = f WHERE id = r.id;
  END LOOP;
END $$;
