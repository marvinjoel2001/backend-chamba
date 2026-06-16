import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UsersService } from '../users.service';
import { UserType, VerificationStatus } from '../entities/user.entity';

@Injectable()
export class VerificationGuard implements CanActivate {
  constructor(
    private readonly usersService: UsersService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    // Si no es worker, no necesita verificación
    if (user.type !== UserType.WORKER) {
      return true;
    }

    // Obtener el usuario completo con estado de verificación
    const fullUser = await this.usersService.findOne(user.id);

    // Permitir acceso si está verificado o si el endpoint no requiere verificación
    const isPublicRoute = this.reflector.get<boolean>(
      'isPublic',
      context.getHandler(),
    );

    if (isPublicRoute) {
      return true;
    }

    // Bloquear si no está verificado
    return fullUser.verificationStatus === VerificationStatus.VERIFIED;
  }
}
