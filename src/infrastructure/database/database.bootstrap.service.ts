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

    // Ensure cancelled_by column exists
    await this.dataSource.query(
      'ALTER TABLE "job_requests" ADD COLUMN IF NOT EXISTS "cancelled_by" uuid;',
    );
    try {
      await this.dataSource.query(
        'ALTER TABLE "job_requests" ADD CONSTRAINT "FK_job_requests_cancelled_by" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL;',
      );
    } catch (e) {
      // Constraint might already exist
    }

    this.logger.log(`PostGIS ready: ${result?.postgis_version}`);
  }
}
