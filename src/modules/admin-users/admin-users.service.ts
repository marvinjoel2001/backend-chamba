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

  private async seedSuperUser() {
    const adminUser = await this.findByUsername('admin');
    if (!adminUser) {
      const salt = await bcrypt.genSalt();
      const passwordHash = await bcrypt.hash('admin', salt);
      const newAdmin = this.adminUserRepository.create({
        username: 'admin',
        passwordHash,
      });
      await this.adminUserRepository.save(newAdmin);
      this.logger.log('Superuser "admin" has been seeded.');
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
    });
  }
}
