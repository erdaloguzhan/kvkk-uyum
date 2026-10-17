import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthUser, CurrentUser } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { sendFile } from './files';
import { GroupsService } from './groups.service';
import { PlatformAdminOnly, TrainingStaffGuard } from './training-staff.guard';
import {
  employeeIdsBody,
  groupCreateBody,
  groupUpdateBody,
  questionBody,
  questionUpdateBody,
  reorderBody,
  resultsQuery,
  sendBody,
  topicBody,
  topicUpdateBody,
  trainerCreateBody,
  trainerUpdateBody,
  trainingCreateBody,
  trainingUpdateBody,
} from './training.schema';
import { TrainersService } from './trainers.service';
import { TrainingsService } from './trainings.service';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Eğitim yönetimi (yönetim paneli): platform yöneticileri ve eğitimciler. */
@Controller('training-admin')
@UseGuards(TrainingStaffGuard)
export class TrainingAdminController {
  constructor(
    private readonly trainers: TrainersService,
    private readonly trainings: TrainingsService,
    private readonly groups: GroupsService,
  ) {}

  // --- Eğitimciler (yalnızca platform yöneticisi değiştirebilir) ---

  @Get('trainers')
  async listTrainers() {
    return { items: await this.trainers.list() };
  }

  @Post('trainers')
  @PlatformAdminOnly()
  createTrainer(@CurrentUser() user: AuthUser, @Body(new ZodPipe(trainerCreateBody)) body: z.infer<typeof trainerCreateBody>) {
    return this.trainers.create(user.id, body);
  }

  @Patch('trainers/:id')
  @PlatformAdminOnly()
  updateTrainer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(trainerUpdateBody)) body: z.infer<typeof trainerUpdateBody>,
  ) {
    return this.trainers.update(user.id, id, body);
  }

  @Delete('trainers/:id')
  @PlatformAdminOnly()
  @HttpCode(204)
  async deleteTrainer(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.trainers.remove(user.id, id);
  }

  @Post('trainers/:id/resend-invite')
  @PlatformAdminOnly()
  @HttpCode(200)
  resendTrainerInvite(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.trainers.resendInvite(user.id, id);
  }

  // --- Eğitimler, alt konular, sorular ---

  @Get('trainings')
  async listTrainings() {
    return { items: await this.trainings.list() };
  }

  @Post('trainings')
  createTraining(@CurrentUser() user: AuthUser, @Body(new ZodPipe(trainingCreateBody)) body: z.infer<typeof trainingCreateBody>) {
    return this.trainings.create(user.id, body);
  }

  @Get('trainings/:id')
  getTraining(@Param('id', ParseUUIDPipe) id: string) {
    return this.trainings.get(id);
  }

  @Patch('trainings/:id')
  updateTraining(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(trainingUpdateBody)) body: z.infer<typeof trainingUpdateBody>,
  ) {
    return this.trainings.update(user.id, id, body);
  }

  @Delete('trainings/:id')
  @HttpCode(204)
  async deleteTraining(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.trainings.remove(user.id, id);
  }

  @Post('trainings/:id/topics')
  addTopic(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(topicBody)) body: z.infer<typeof topicBody>,
  ) {
    return this.trainings.addTopic(user.id, id, body);
  }

  @Post('trainings/:id/topics/reorder')
  @HttpCode(200)
  reorderTopics(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(reorderBody)) body: z.infer<typeof reorderBody>,
  ) {
    return this.trainings.reorderTopics(user.id, id, body.ids);
  }

  @Patch('topics/:id')
  updateTopic(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(topicUpdateBody)) body: z.infer<typeof topicUpdateBody>,
  ) {
    return this.trainings.updateTopic(user.id, id, body);
  }

  @Delete('topics/:id')
  @HttpCode(204)
  async deleteTopic(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.trainings.removeTopic(user.id, id);
  }

  @Post('trainings/:id/questions')
  addQuestion(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(questionBody)) body: z.infer<typeof questionBody>,
  ) {
    return this.trainings.addQuestion(user.id, id, body);
  }

  @Patch('questions/:id')
  updateQuestion(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(questionUpdateBody)) body: z.infer<typeof questionUpdateBody>,
  ) {
    return this.trainings.updateQuestion(user.id, id, body);
  }

  @Delete('questions/:id')
  @HttpCode(204)
  async deleteQuestion(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.trainings.removeQuestion(user.id, id);
  }

  /** Ders anlatımına eklenecek görsel (`file` alanında, en fazla 2 MB). */
  @Post('media')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  uploadMedia(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Görsel dosyası gerekli');
    return this.trainings.addMedia(user.id, file);
  }

  // --- Gruplar, katılımcılar, sonuçlar ---

  @Get('organizations')
  async organizations() {
    return { items: await this.groups.organizations() };
  }

  @Get('organizations/:id/employees')
  async employees(@Param('id', ParseUUIDPipe) id: string) {
    return { items: await this.groups.employees(id) };
  }

  @Get('groups')
  async listGroups(@Query(new ZodPipe(resultsQuery)) query: z.infer<typeof resultsQuery>) {
    return { items: await this.groups.list(query) };
  }

  @Post('groups')
  createGroup(@CurrentUser() user: AuthUser, @Body(new ZodPipe(groupCreateBody)) body: z.infer<typeof groupCreateBody>) {
    return this.groups.create(user.id, body);
  }

  @Get('groups/:id')
  getGroup(@Param('id', ParseUUIDPipe) id: string) {
    return this.groups.get(id);
  }

  @Patch('groups/:id')
  renameGroup(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(groupUpdateBody)) body: z.infer<typeof groupUpdateBody>,
  ) {
    return this.groups.rename(user.id, id, body.name);
  }

  @Delete('groups/:id')
  @HttpCode(204)
  async deleteGroup(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.groups.remove(user.id, id);
  }

  @Post('groups/:id/participants')
  addParticipants(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(employeeIdsBody)) body: z.infer<typeof employeeIdsBody>,
  ) {
    return this.groups.addParticipants(user.id, id, body.employeeIds);
  }

  @Delete('groups/:id/participants/:participantId')
  removeParticipant(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
  ) {
    return this.groups.removeParticipant(user.id, id, participantId);
  }

  /** Eğitimi başlatır: katılımcılara eğitim bağlantısı ve giriş bilgileri gönderilir. */
  @Post('groups/:id/send')
  @HttpCode(200)
  send(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(sendBody)) body: z.infer<typeof sendBody>,
  ) {
    return this.groups.send(user.id, id, body.participantIds);
  }

  @Get('results')
  async results(@Query(new ZodPipe(resultsQuery)) query: z.infer<typeof resultsQuery>) {
    return { items: await this.groups.results(query) };
  }

  /** GEÇİCİ: deneme dönemi için katılımcı kaydını sonuçlarıyla siler (bkz. GroupsService.deleteParticipantRecord). */
  @Delete('participants/:id')
  @PlatformAdminOnly()
  @HttpCode(204)
  async deleteParticipantRecord(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.groups.deleteParticipantRecord(user.id, id);
  }

  @Get('participants/:id/certificate')
  async certificate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { pdf, fileName } = await this.groups.certificate(user.id, id);
    sendFile(res, pdf, fileName, 'application/pdf');
  }
}
