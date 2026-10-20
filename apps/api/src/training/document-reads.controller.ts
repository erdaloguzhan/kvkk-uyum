import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { PERMISSIONS } from '@kvkk/shared';
import { CurrentOrg, OrgContext, RequirePermissions } from '../common/request-context';
import { PortalDocumentsService } from './portal-documents.service';

/** Çalışanların eğitim portalında verdiği "Okudum, anladım." onayları (kuruluş tarafı). */
@Controller('documents')
export class DocumentReadsController {
  constructor(private readonly documents: PortalDocumentsService) {}

  @Get(':id/reads')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_READ)
  reads(@CurrentOrg() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.readReport(org.id, id);
  }
}
