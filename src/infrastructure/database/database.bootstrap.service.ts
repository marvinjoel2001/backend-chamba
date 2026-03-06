import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DatabaseBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseBootstrapService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    await this.ensurePostgis();
  }

  private async ensurePostgis(): Promise<void> {
    await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS postgis;');
    const [result] = await this.dataSource.query<{ postgis_version: string }[]>(
      'SELECT postgis_version();',
    );

    this.logger.log(`PostGIS ready: ${result.postgis_version}`);
  }
}
