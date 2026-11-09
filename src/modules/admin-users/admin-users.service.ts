import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminUser } from './entities/admin-user.entity';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AdminUsersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    @InjectRepository(AdminUser)
    private readonly adminUserRepository: Repository<AdminUser>,
  ) {}

  async onApplicationBootstrap() {
    await this.seedSuperUser();
  }

  /**
   * Crea admin/admin si no existe. Mientras su contraseña siga siendo "admin"
   * queda marcado para cambiarla: el panel no deja hacer nada más hasta que
   * la cambie.
   */
  private async seedSuperUser() {
    const adminUser = await this.findByUsername('admin');
    if (!adminUser) {
      const salt = await bcrypt.genSalt();
      const passwordHash = await bcrypt.hash('admin', salt);
      const newAdmin = this.adminUserRepository.create({
        username: 'admin',
        passwordHash,
        mustChangePassword: true,
      });
      await this.adminUserRepository.save(newAdmin);
      this.logger.log('Superuser "admin" has been seeded.');
      return;
    }
    if (
      !adminUser.mustChangePassword &&
      (await bcrypt.compare('admin', adminUser.passwordHash))
    ) {
      await this.adminUserRepository.update(adminUser.id, {
        mustChangePassword: true,
      });
      this.logger.warn('Admin "admin" still uses the default password.');
    }
  }

  async findByUsername(username: string): Promise<AdminUser | null> {
    return this.adminUserRepository.findOne({ where: { username } });
  }

  async findById(id: string): Promise<AdminUser | null> {
    return this.adminUserRepository.findOne({ where: { id } });
  }

  async updatePassword(id: string, newPasswordHash: string): Promise<void> {
    await this.adminUserRepository.update(id, {
      passwordHash: newPasswordHash,
      mustChangePassword: false,
    });
  }
}
