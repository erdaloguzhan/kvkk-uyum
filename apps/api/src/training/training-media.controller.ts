import { Controller, Get, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/request-context';
import { TrainingsService } from './trainings.service';

/**
 * Ders anlatımındaki görseller. Görseller tahmin edilemez kimlikle açıktır (katılımcı portalında ve yönetim
 * panelinde <img> ile gösterilir; tarayıcı görsel isteğine oturum belirteci ekleyemez).
 */
@Controller('training-media')
@Public()
export class TrainingMediaController {
  constructor(private readonly trainings: TrainingsService) {}

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const media = await this.trainings.media(id);
    res.type(media.mimeType).set('Cache-Control', 'private, max-age=86400').set('X-Content-Type-Options', 'nosniff').send(media.content);
  }
}
