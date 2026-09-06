import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DrawingResponse, DrawingsService } from './drawings.service';
import { CurrentUser, type AuthedUser } from '../auth/current-user.decorator';
import { RateLimitGuard } from '../common/rate-limit.guard';

/** Hard ceiling on the multipart body, above the configurable per-file limit. */
const ABSOLUTE_MAX_BYTES = 32 * 1024 * 1024;

@ApiTags('drawings')
@Controller('api/drawings')
@UseGuards(RateLimitGuard)
export class DrawingsController {
  constructor(private readonly drawings: DrawingsService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a DXF drawing and extract its geometry.' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: ABSOLUTE_MAX_BYTES } }))
  upload(
    @CurrentUser() user: AuthedUser,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<DrawingResponse> {
    if (!file) throw new BadRequestException('Choose a drawing file to upload.');
    return this.drawings.upload(user.id, file.originalname, file.buffer);
  }

  @Get(':id')
  byId(@CurrentUser() user: AuthedUser, @Param('id') id: string): Promise<DrawingResponse> {
    return this.drawings.byId(user.id, id);
  }
}
