import { Module } from '@nestjs/common';
import { DrawingsController } from './drawings.controller';
import { DrawingsService } from './drawings.service';
import { DxfParserService } from './dxf-parser.service';
import { BendsController } from '../bends/bends.controller';

@Module({
  controllers: [DrawingsController, BendsController],
  providers: [DrawingsService, DxfParserService],
  exports: [DrawingsService, DxfParserService],
})
export class DrawingsModule {}
