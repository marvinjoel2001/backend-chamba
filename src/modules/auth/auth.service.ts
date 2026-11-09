import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { LoginAttemptsService } from '../access/login-attempts.service';
import { JwtService } from '@nestjs/jwt';
import { AdminUsersService } from '../admin-users/admin-users.service';
import * as bcrypt from 'bcryptjs';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly adminUsersService: AdminUsersService,
    private readonly jwtService: JwtService,
    @Optional() private readonly loginAttempts?: LoginAttemptsService,
  ) {}

  async validateAdminUser(loginDto: LoginDto): Promise<any> {
    const user = await this.adminUsersService.findByUsername(loginDto.username);
    if (user && (await bcrypt.compare(loginDto.password, user.passwordHash))) {
      const { passwordHash, ...result } = user;
      return result;
    }
    return null;
  }

  async login(loginDto: LoginDto) {
    // 5 intentos fallidos bloquean ese usuario 15 minutos.
    const attemptsKey = loginDto.username.trim().toLowerCase();
    await this.loginAttempts?.assertAllowed('admin', attemptsKey);
    const user = await this.validateAdminUser(loginDto);
    if (!user) {
      const remaining = await this.loginAttempts?.recordFailure('admin', attemptsKey);
      throw new UnauthorizedException(remaining === undefined ? 'Invalid credentials'
        : this.loginAttempts!.invalidCredentialsMessage('admin', remaining, 'Usuario o contraseña incorrectos'));
    }
    await this.loginAttempts?.reset('admin', attemptsKey);
    const payload = { username: user.username, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        mustChangePassword: user.mustChangePassword === true,
      },
    };
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const user = await this.adminUsersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isPasswordValid = await bcrypt.compare(
      changePasswordDto.currentPassword,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('La contraseña actual es incorrecta');
    }
    if (
      changePasswordDto.newPassword === changePasswordDto.currentPassword ||
      changePasswordDto.newPassword.trim().toLowerCase() === 'admin'
    ) {
      throw new BadRequestException(
        'Elige una contraseña nueva, distinta de la actual',
      );
    }

    const salt = await bcrypt.genSalt();
    const newPasswordHash = await bcrypt.hash(
      changePasswordDto.newPassword,
      salt,
    );

    await this.adminUsersService.updatePassword(userId, newPasswordHash);

    return { message: 'Password changed successfully' };
  }
}
