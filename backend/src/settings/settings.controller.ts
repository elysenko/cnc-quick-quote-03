import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { SettingsService } from './settings.service';
import type { MachineDoc, PricingDoc, UploadDoc } from './settings.defaults';

@ApiTags('settings')
@Controller('api/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Public()
  @Get('public-business')
  @ApiOperation({ summary: 'Branding applied by the app shell before sign-in.' })
  publicBusiness(): Promise<Record<string, string>> {
    return this.settings.getPublicBusiness();
  }

  /**
   * Non-secret operating configuration the quote wizard needs to mirror the server:
   * upload limits, machine bed and quantity bounds, and the current rate card. It is
   * the same document the server prices with, so the live preview and the generated
   * quote cannot disagree.
   */
  @Get('config')
  @ApiOperation({ summary: 'Machine, upload and pricing configuration for the quote wizard.' })
  async config(): Promise<{ machine: MachineDoc; upload: UploadDoc; pricing: PricingDoc }> {
    const [machine, upload, pricing] = await Promise.all([
      this.settings.get('machine'),
      this.settings.get('upload'),
      this.settings.get('pricing'),
    ]);
    return { machine, upload, pricing };
  }
}
