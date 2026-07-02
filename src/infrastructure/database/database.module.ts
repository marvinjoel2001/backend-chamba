import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseBootstrapService } from './database.bootstrap.service';
import { InitialBaselineSchema1717000000000 } from './migrations/1717000000000-InitialBaselineSchema';
import { AddModalityToJobRequests1781633301782 } from './migrations/1781633301782-AddModalityToJobRequests';
import { AddReminderLevelToJobRequests1782866723182 } from './migrations/1782866723182-AddReminderLevelToJobRequests';
import { AddStartReminderSentAndTimeConfigSeeds1783500000000 } from './migrations/1783500000000-AddStartReminderSentAndTimeConfigSeeds';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.getOrThrow<string>('DATABASE_HOST'),
        port: configService.getOrThrow<number>('DATABASE_PORT'),
        username: configService.getOrThrow<string>('DATABASE_USERNAME'),
        password: configService.getOrThrow<string>('DATABASE_PASSWORD'),
        database: configService.getOrThrow<string>('DATABASE_NAME'),
        synchronize: configService.get<boolean>('DATABASE_SYNC', false),
        ssl: configService.get<boolean>('DATABASE_SSL', false)
          ? { rejectUnauthorized: false }
          : false,
        autoLoadEntities: true,
        migrations: [
          InitialBaselineSchema1717000000000,
          AddModalityToJobRequests1781633301782,
          AddReminderLevelToJobRequests1782866723182,
          AddStartReminderSentAndTimeConfigSeeds1783500000000,
        ],
        migrationsRun: true,
        migrationsTableName: 'typeorm_migrations',
      }),
    }),
  ],
  providers: [DatabaseBootstrapService],
})
export class DatabaseModule {}
