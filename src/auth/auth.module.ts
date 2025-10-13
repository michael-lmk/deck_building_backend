import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    JwtModule.register({
      secret: 'SUPER_SECRET_KEY', // à mettre dans .env plus tard
      signOptions: { expiresIn: '10h' },
    }),
  ],
  controllers: [AuthController],
})
export class AuthModule {}
