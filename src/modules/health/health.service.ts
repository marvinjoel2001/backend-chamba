import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
  ) {}

  async check() {
    const [dbProbe] = await this.dataSource.query<
      { db_now: string; postgis_version: string }[]
    >('SELECT NOW() as db_now, postgis_version() as postgis_version;');
    const redisProbe = await this.redisService.client.ping();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      dependencies: {
        postgres: {
          connected: true,
          dbTime: dbProbe.db_now,
        },
        postgis: {
          enabled: true,
          version: dbProbe.postgis_version,
        },
        redis: {
          connected: redisProbe === 'PONG',
        },
      },
    };
  }
}
