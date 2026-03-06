import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.DATABASE_HOST = process.env.DATABASE_HOST || 'localhost';
    process.env.DATABASE_PORT = process.env.DATABASE_PORT || '5432';
    process.env.DATABASE_USERNAME = process.env.DATABASE_USERNAME || 'postgres';
    process.env.DATABASE_PASSWORD = process.env.DATABASE_PASSWORD || 'postgres';
    process.env.DATABASE_NAME = process.env.DATABASE_NAME || 'chamba';
    process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
    process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET || 'test-session-secret-1234';
    process.env.R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || 'test';
    process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || 'test';
    process.env.R2_SECRET_ACCESS_KEY =
      process.env.R2_SECRET_ACCESS_KEY || 'test';
    process.env.R2_BUCKET = process.env.R2_BUCKET || 'test';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer()).get('/api/health').expect(200);
  });
});
