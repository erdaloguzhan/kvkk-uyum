import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { PERMISSIONS } from '@kvkk/shared';
import { z } from 'zod';
import { AuthUser, CurrentOrg, CurrentUser, OrgContext, RequirePermissions } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import {
  cancelItemBody,
  completeBody,
  decisionBody,
  fromInventoryBody,
  itemBody,
  itemUpdateBody,
  nextPlanBody,
  officerBody,
  officerUpdateBody,
  planBody,
  planUpdateBody,
  recordBody,
  recordListQuery,
  recordUpdateBody,
  rejectBody,
  settingsBody,
  submitBody,
} from './destruction.schema';
import { DestructionService } from './destruction.service';

const READ = PERMISSIONS.DESTRUCTION_READ;
const MANAGE = PERMISSIONS.DESTRUCTION_MANAGE;
const APPROVE = PERMISSIONS.DESTRUCTION_APPROVE;
const id = new ParseUUIDPipe();

@Controller('destruction')
export class DestructionController {
  constructor(private readonly destruction: DestructionService) {}

  // ---- Ayarlar ----

  @Get('settings')
  @RequirePermissions(READ)
  settings(@CurrentOrg() org: OrgContext) {
    return this.destruction.settings(org.id);
  }

  @Put('settings')
  @RequirePermissions(MANAGE)
  updateSettings(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(settingsBody)) body: z.infer<typeof settingsBody>,
  ) {
    return this.destruction.updateSettings(org.id, user.id, body.periodMonths);
  }

  @Get('employees')
  @RequirePermissions(MANAGE)
  async employees(@CurrentOrg() org: OrgContext) {
    return { items: await this.destruction.employeeOptions(org.id) };
  }

  // ---- İmha sorumluları ----

  @Get('officers')
  @RequirePermissions(READ)
  async officers(@CurrentOrg() org: OrgContext) {
    return { items: await this.destruction.listOfficers(org.id) };
  }

  @Post('officers')
  @RequirePermissions(MANAGE)
  createOfficer(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(officerBody)) body: z.infer<typeof officerBody>,
  ) {
    return this.destruction.createOfficer(org.id, user.id, body);
  }

  @Patch('officers/:id')
  @RequirePermissions(MANAGE)
  updateOfficer(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', id) officerId: string,
    @Body(new ZodPipe(officerUpdateBody)) body: z.infer<typeof officerUpdateBody>,
  ) {
    return this.destruction.updateOfficer(org.id, user.id, officerId, body);
  }

  // ---- İmha planları ----

  @Get('plans')
  @RequirePermissions(READ)
  async plans(@CurrentOrg() org: OrgContext) {
    return { items: await this.destruction.listPlans(org.id) };
  }

  @Post('plans')
  @RequirePermissions(MANAGE)
  createPlan(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(planBody)) body: z.infer<typeof planBody>,
  ) {
    return this.destruction.createPlan(org.id, user.id, body);
  }

  @Get('plans/:id')
  @RequirePermissions(READ)
  plan(@CurrentOrg() org: OrgContext, @Param('id', id) planId: string) {
    return this.destruction.getPlan(org.id, planId);
  }

  @Patch('plans/:id')
  @RequirePermissions(MANAGE)
  updatePlan(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', id) planId: string,
    @Body(new ZodPipe(planUpdateBody)) body: z.infer<typeof planUpdateBody>,
  ) {
    return this.destruction.updatePlan(org.id, user.id, planId, body);
  }

  @Delete('plans/:id')
  @HttpCode(204)
  @RequirePermissions(MANAGE)
  async deletePlan(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser, @Param('id', id) planId: string) {
    await this.destruction.deletePlan(org.id, user.id, planId);
  }

  @Post('plans/:id/next')
  @RequirePermissions(MANAGE)
  nextPlan(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', id) planId: string,
    @Body(new ZodPipe(nextPlanBody)) body: z.infer<typeof nextPlanBody>,
  ) {
    return this.destruction.nextPlan(org.id, user.id, planId, body.title);
  }

  @Post('plans/:id/items')
  @RequirePermissions(MANAGE)
  addItem(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', id) planId: string,
    @Body(new ZodPipe(itemBody)) body: z.infer<typeof itemBody>,
  ) {
    return this.destruction.addItem(org.id, user.id, planId, body);
  }

  @Post('plans/:id/items/from-inventory')
  @HttpCode(200)
  @RequirePermissions(MANAGE)
  fromInventory(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', id) planId: string,
    @Body(new ZodPipe(fromInventoryBody)) body: z.infer<typeof fromInventoryBody>,
  ) {
    return this.destruction.addFromInventory(org.id, user.id, planId, body.entryIds);
  }

  @Post('plans/:id/submit')
  @HttpCode(200)
  @RequirePermissions(MANAGE)
  submit(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', id) planId: string,
    @Body(new ZodPipe(submitBody)) body: z.infer<typeof submitBody>,
  ) {
    return this.destruction.submit(org.id, user.id, planId, body);
  }

  @Post('plans/:id/withdraw')
  @HttpCode(200)
  @RequirePermissions(MANAGE)
  withdraw(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser, @Param('id', id) planId: string) {
    return this.destruction.withdraw(org.id, user.id, planId);
  }

  @Post('plans/:id/approve')
  @HttpCode(200)
  @RequirePermissions(APPROVE)
  approve(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', id) planId: string,
    @Body(new ZodPipe(decisionBody)) body: z.infer<typeof decisionBody>,
  ) {
    return this.destruction.approve(org.id, user.id, planId, body.note);
  }

  @Post('plans/:id/reject')
  @HttpCode(200)
  @RequirePermissions(APPROVE)
  reject(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', id) planId: string,
    @Body(new ZodPipe(rejectBody)) body: z.infer<typeof rejectBody>,
  ) {
    return this.destruction.reject(org.id, user.id, planId, body.note);
  }

  // ---- Plandaki imha işleri ----

  /** Görevden gelen bağlantı için: işin bağlı olduğu plan. */
  @Get('items/:id')
  @RequirePermissions(READ)
  item(@CurrentOrg() org: OrgContext, @Param('id', id) itemId: string) {
    return this.destruction.getItem(org.id, itemId);
  }

  @Patch('items/:id')
  @RequirePermissions(MANAGE)
  updateItem(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', id) itemId: string,
    @Body(new ZodPipe(itemUpdateBody)) body: z.infer<typeof itemUpdateBody>,
  ) {
    return this.destruction.updateItem(org.id, user.id, itemId, body);
  }

  @Delete('items/:id')
  @HttpCode(204)
  @RequirePermissions(MANAGE)
  async deleteItem(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser, @Param('id', id) itemId: string) {
    await this.destruction.deleteItem(org.id, user.id, itemId);
  }

  @Post('items/:id/cancel')
  @HttpCode(200)
  @RequirePermissions(MANAGE)
  cancelItem(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', id) itemId: string,
    @Body(new ZodPipe(cancelItemBody)) body: z.infer<typeof cancelItemBody>,
  ) {
    return this.destruction.cancelItem(org.id, user.id, itemId, body.reason);
  }

  @Post('items/:id/complete')
  @RequirePermissions(MANAGE)
  completeItem(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', id) itemId: string,
    @Body(new ZodPipe(completeBody)) body: z.infer<typeof completeBody>,
  ) {
    return this.destruction.completeItem(org.id, user.id, itemId, body);
  }

  // ---- İmha işlemi kayıtları ----

  @Get('records')
  @RequirePermissions(READ)
  async records(@CurrentOrg() org: OrgContext, @Query(new ZodPipe(recordListQuery)) query: z.infer<typeof recordListQuery>) {
    return { items: await this.destruction.listRecords(org.id, query) };
  }

  @Post('records')
  @RequirePermissions(MANAGE)
  createRecord(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(recordBody)) body: z.infer<typeof recordBody>,
  ) {
    return this.destruction.createRecord(org.id, user.id, body);
  }

  @Patch('records/:id')
  @RequirePermissions(MANAGE)
  updateRecord(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', id) recordId: string,
    @Body(new ZodPipe(recordUpdateBody)) body: z.infer<typeof recordUpdateBody>,
  ) {
    return this.destruction.updateRecord(org.id, user.id, recordId, body);
  }

  @Delete('records/:id')
  @HttpCode(204)
  @RequirePermissions(MANAGE)
  async deleteRecord(@CurrentOrg() org: OrgContext, @CurrentUser() user: AuthUser, @Param('id', id) recordId: string) {
    await this.destruction.deleteRecord(org.id, user.id, recordId);
  }
}
