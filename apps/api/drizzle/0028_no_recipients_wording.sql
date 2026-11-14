-- "Kategorideki" yerine "kategoride" (Erdal, 14.11.2026): mevcut envanter satırlarındaki cümle de güncellenir.
UPDATE "inventory_entries" SET "recipients" = array_replace(
  "recipients",
  'Bu departman, süreç ve kategorideki alıcı gruplarından hiç birine veri aktarılmamaktadır.',
  'Bu departman, süreç ve kategoride alıcı gruplarından hiç birine veri aktarılmamaktadır.'
)
WHERE 'Bu departman, süreç ve kategorideki alıcı gruplarından hiç birine veri aktarılmamaktadır.' = ANY("recipients");
