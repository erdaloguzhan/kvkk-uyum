import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { INVENTORY_COLUMNS } from '@kvkk/shared';
import { z } from 'zod';
import { PlatformAdminGuard } from '../admin/platform-admin.guard';
import { AuthUser, CurrentUser } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { InventoryTemplateService, TEMPLATE_FIELDS, TemplateField } from './inventory-template.service';

const field = z.enum(TEMPLATE_FIELDS as [TemplateField, ...TemplateField[]]);
const optionFields = {
  value: z.string().trim().min(1).max(500),
  examples: z.string().trim().max(1000).nullish(),
  special: z.boolean().optional(),
};
const addBody = z.object({ field, ...optionFields });
const updateBody = z.object(optionFields).partial();
const reorderBody = z.object({ field, ids: z.array(z.uuid()).max(500) });

/** Kişisel Veri Envanteri (şablon): sütun seçenekleri (yalnızca platform yöneticisi). */
@Controller('admin/inventory-template')
@UseGuards(PlatformAdminGuard)
export class InventoryTemplateController {
  constructor(private readonly template: InventoryTemplateService) {}

  @Get()
  async list() {
    return {
      columns: INVENTORY_COLUMNS.filter((c) => (TEMPLATE_FIELDS as string[]).includes(c.field)),
      items: await this.template.all(),
    };
  }

  @Post()
  add(@CurrentUser() user: AuthUser, @Body(new ZodPipe(addBody)) { field, ...input }: z.infer<typeof addBody>) {
    return this.template.add(user.id, field, input);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateBody)) body: z.infer<typeof updateBody>) {
    return this.template.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.template.remove(user.id, id);
  }

  @Put('order')
  @HttpCode(204)
  reorder(@CurrentUser() user: AuthUser, @Body(new ZodPipe(reorderBody)) body: z.infer<typeof reorderBody>) {
    return this.template.reorder(user.id, body.field, body.ids);
  }
}
