import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { INVENTORY_COLUMNS, InventoryField } from '@kvkk/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { Database, InjectDb } from '../db/db.module';
import { inventoryTemplateOptions } from '../db/schema';

/** Şablonda seçenek tutulan sütunlar: Fiziksel/Dijital dışındaki tüm TBL-010 sütunları. */
export const TEMPLATE_FIELDS = INVENTORY_COLUMNS.filter((c) => c.kind !== 'enum').map((c) => c.field) as Exclude<
  InventoryField,
  'storageMedium'
>[];
export type TemplateField = (typeof TEMPLATE_FIELDS)[number];

export interface TemplateOptionInput {
  value: string;
  examples?: string | null;
  special?: boolean;
}

/**
 * Kişisel Veri Envanteri (şablon): envanter sütunlarındaki seçenekler veritabanından gelir, platform yöneticisi
 * düzenler (Erdal, 28.10.2026). Değişiklik sonraki girişlerde görünür; mevcut satırlardaki değerler değişmez.
 */
@Injectable()
export class InventoryTemplateService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /** Tüm seçenekler, sütun ve sıra düzeninde. */
  async all() {
    return this.db
      .select()
      .from(inventoryTemplateOptions)
      .orderBy(asc(inventoryTemplateOptions.field), asc(inventoryTemplateOptions.sortOrder), asc(inventoryTemplateOptions.createdAt));
  }

  /** Envanter girişi için: sütun başına sıralı seçenekler ve veri kategorilerinin örnekleri. */
  async forInventory() {
    const rows = await this.all();
    const byField = new Map<string, string[]>();
    for (const r of rows) byField.set(r.field, [...(byField.get(r.field) ?? []), r.value]);
    const dataCategories = rows
      .filter((r) => r.field === 'dataCategory')
      .map((r) => ({ name: r.value, examples: r.examples ?? '', special: r.special }));
    return { byField, dataCategories };
  }

  async add(adminId: string, field: TemplateField, input: TemplateOptionInput) {
    const [{ next }] = await this.db
      .select({ next: sql<number>`coalesce(max(${inventoryTemplateOptions.sortOrder}), 0)::int + 1` })
      .from(inventoryTemplateOptions)
      .where(eq(inventoryTemplateOptions.field, field));
    const [row] = await this.db
      .insert(inventoryTemplateOptions)
      .values({ field, value: input.value, examples: input.examples ?? null, special: input.special ?? false, sortOrder: next })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new ConflictException('Bu seçenek bu sütunda zaten var');
    await this.audit.record({ action: 'inventory_template.option_added', userId: adminId, entityType: 'inventory_template_option', entityId: row.id, metadata: { field, value: row.value } });
    return row;
  }

  async update(adminId: string, id: string, input: Partial<TemplateOptionInput>) {
    const before = await this.get(id);
    if (input.value !== undefined && input.value !== before.value) {
      const [dup] = await this.db
        .select({ id: inventoryTemplateOptions.id })
        .from(inventoryTemplateOptions)
        .where(and(eq(inventoryTemplateOptions.field, before.field), eq(inventoryTemplateOptions.value, input.value)));
      if (dup) throw new ConflictException('Bu seçenek bu sütunda zaten var');
    }
    const [row] = await this.db
      .update(inventoryTemplateOptions)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(inventoryTemplateOptions.id, id))
      .returning();
    await this.audit.record({
      action: 'inventory_template.option_updated',
      userId: adminId,
      entityType: 'inventory_template_option',
      entityId: id,
      metadata: { field: before.field, from: before.value, to: row.value },
    });
    return row;
  }

  async remove(adminId: string, id: string) {
    const before = await this.get(id);
    await this.db.delete(inventoryTemplateOptions).where(eq(inventoryTemplateOptions.id, id));
    await this.audit.record({
      action: 'inventory_template.option_removed',
      userId: adminId,
      entityType: 'inventory_template_option',
      entityId: id,
      metadata: { field: before.field, value: before.value },
    });
  }

  /** Sütunun seçeneklerini verilen sırayla dizer; liste sütunun tüm seçeneklerini içermelidir. */
  async reorder(adminId: string, field: TemplateField, ids: string[]) {
    const rows = await this.db
      .select({ id: inventoryTemplateOptions.id })
      .from(inventoryTemplateOptions)
      .where(eq(inventoryTemplateOptions.field, field));
    const current = new Set(rows.map((r) => r.id));
    if (ids.length !== current.size || new Set(ids).size !== ids.length || ids.some((id) => !current.has(id))) {
      throw new BadRequestException('Sıralama sütunun tüm seçeneklerini içermeli');
    }
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx.update(inventoryTemplateOptions).set({ sortOrder: i + 1 }).where(eq(inventoryTemplateOptions.id, id));
      }
    });
    await this.audit.record({ action: 'inventory_template.reordered', userId: adminId, metadata: { field } });
  }

  private async get(id: string) {
    const [row] = await this.db.select().from(inventoryTemplateOptions).where(eq(inventoryTemplateOptions.id, id));
    if (!row) throw new NotFoundException('Seçenek bulunamadı');
    return row;
  }
}
