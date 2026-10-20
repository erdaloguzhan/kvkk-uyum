import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { ORG_HEADER } from '../common/org.guard';
import { AppRequest, AuthUser, CurrentUser } from '../common/request-context';
import { Database, InjectDb } from '../db/db.module';
import { findActiveMember } from '../workflow/members';
import { ZodPipe } from '../common/zod.pipe';
import { sendFile, XLSX_MIME } from './files';

const cell = z.union([z.string().max(10_000), z.number(), z.boolean(), z.null()]);
const exportBody = z.object({
  fileName: z.string().trim().min(1).max(150),
  sheetName: z.string().trim().max(31).optional(),
  columns: z.array(z.object({ key: z.string().max(100), label: z.string().max(200) })).min(1).max(100),
  rows: z.array(z.record(z.string(), cell)).max(20_000),
});

/**
 * Ekrandaki bir tabloyu Excel dosyasına çevirir. Veri zaten kullanıcının ekranındadır; sunucu yalnızca
 * dosya biçimine dönüştürür (her tabloda "Excel'e aktar" düğmesi bunu kullanır).
 */
@Controller('export')
export class ExportController {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  @Post('xlsx')
  @HttpCode(200)
  async xlsx(
    @Req() req: AppRequest,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(exportBody)) body: z.infer<typeof exportBody>,
    @Res() res: Response,
  ) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet((body.sheetName || 'Liste').replace(/[\\/?*[\]:]/g, ' '));
    sheet.columns = body.columns.map((c) => ({ header: c.label, key: c.key, width: Math.min(60, Math.max(12, c.label.length + 4)) }));
    sheet.getRow(1).font = { bold: true };
    for (const row of body.rows) {
      // Formül enjeksiyonuna karşı = + - @ ile başlayan metinler düz metin olarak yazılır.
      const safe = Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v]),
      );
      sheet.addRow(safe);
    }
    const fileName = body.fileName.replace(/[\\/:*?"<>|]/g, ' ').replace(/\.xlsx$/i, '') + '.xlsx';
    // Müşteri ekranından yapılan aktarım, kullanıcının üyesi olduğu kuruluşun loglarında görünür.
    const orgId = req.headers[ORG_HEADER];
    const member =
      typeof orgId === 'string' && z.uuid().safeParse(orgId).success ? await findActiveMember(this.db, orgId, user.id) : null;
    await this.audit.record({
      action: 'export.xlsx',
      organizationId: member ? (orgId as string) : null,
      userId: user.id,
      metadata: { fileName, rows: body.rows.length },
    });
    sendFile(res, Buffer.from(await workbook.xlsx.writeBuffer()), fileName, XLSX_MIME);
  }
}
