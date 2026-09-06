import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty() password!: string;
}

export class LoginDto {
  @ApiProperty() email!: string;
  @ApiProperty() password!: string;
}

export class RefreshDto {
  @ApiProperty() refreshToken!: string;
}
