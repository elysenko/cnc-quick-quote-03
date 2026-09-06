import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, type AuthedUser } from '../auth/current-user.decorator';

interface ProfilePatch {
  name?: string;
  company?: string;
}

export interface AccountProfile {
  id: string;
  email: string;
  name: string;
  company: string;
  role: string;
  createdAt: string;
}

export interface AccountStats {
  quoteCount: number;
  orderCount: number;
  lifetimeSpendCents: number;
}

@ApiTags('account')
@Controller('api/account')
export class AccountController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async profile(@CurrentUser() user: AuthedUser): Promise<AccountProfile> {
    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return {
      id: row.id,
      email: row.email,
      name: row.name ?? '',
      company: row.company ?? '',
      role: row.role,
      createdAt: row.createdAt.toISOString(),
    };
  }

  @Patch()
  @ApiOperation({ summary: 'Update the display name and company on the signed-in profile.' })
  async update(
    @CurrentUser() user: AuthedUser,
    @Body() body: ProfilePatch,
  ): Promise<AccountProfile> {
    // Email is the login identity and is deliberately not editable here.
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(body?.name !== undefined ? { name: String(body.name).trim() } : {}),
        ...(body?.company !== undefined ? { company: String(body.company).trim() } : {}),
      },
    });
    return this.profile(user);
  }

  @Get('stats')
  async stats(@CurrentUser() user: AuthedUser): Promise<AccountStats> {
    const [quoteCount, orderCount, spend] = await Promise.all([
      this.prisma.quote.count({ where: { userId: user.id } }),
      this.prisma.order.count({ where: { userId: user.id } }),
      this.prisma.order.aggregate({
        where: { userId: user.id, status: { not: 'cancelled' } },
        _sum: { totalCents: true },
      }),
    ]);
    return { quoteCount, orderCount, lifetimeSpendCents: spend._sum.totalCents ?? 0 };
  }
}
