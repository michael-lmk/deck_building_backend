import { Controller, Post, Body } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Controller('auth')
export class AuthController {
  constructor(private readonly jwtService: JwtService) {}

  @Post('temp-login')
  async tempLogin(@Body('username') username: string) {
    if (!username) {
      return { error: 'Username is required' };
    }

    // Générer un JWT avec payload minimal
    const token = this.jwtService.sign({ username }, { expiresIn: '10h' });

    return { token };
  }
}
