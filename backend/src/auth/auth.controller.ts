import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthResult, AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterDto } from './auth.dto';
import { Public } from './public.decorator';
import { CurrentUser, type AuthedUser } from './current-user.decorator';

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create an account. The first account becomes ADMIN.' })
  register(@Body() body: RegisterDto): Promise<AuthResult> {
    const email = (body?.email ?? '').trim();
    if (!EMAIL_RE.test(email)) throw new BadRequestException('Enter a valid email address.');
    if ((body?.password ?? '').length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    return this.auth.register(body.name ?? '', email, body.password);
  }

  @Public()
  @Post('login')
  login(@Body() body: LoginDto): Promise<AuthResult> {
    if (!body?.email || !body?.password) {
      throw new BadRequestException('Enter your email address and password to continue.');
    }
    return this.auth.login(body.email, body.password);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() body: RefreshDto): Promise<AuthResult> {
    if (!body?.refreshToken) throw new BadRequestException('No refresh token supplied.');
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  async logout(
    @CurrentUser() user: AuthedUser,
    @Body() body: Partial<RefreshDto>,
  ): Promise<{ ok: true }> {
    await this.auth.logout(body?.refreshToken, user.jti);
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthedUser): Omit<AuthedUser, 'jti'> {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }
}
