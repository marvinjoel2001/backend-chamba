import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseBootstrapService } from './database.bootstrap.service';
import { InitialBaselineSchema1717000000000 } from './migrations/1717000000000-InitialBaselineSchema';
import { AddModalityToJobRequests1781633301782 } from './migrations/1781633301782-AddModalityToJobRequests';
import { AddReminderLevelToJobRequests1782866723182 } from './migrations/1782866723182-AddReminderLevelToJobRequests';
import { AddStartReminderSentAndTimeConfigSeeds1783500000000 } from './migrations/1783500000000-AddStartReminderSentAndTimeConfigSeeds';
import { BackfillAcceptedJobChats1791333000000 } from './migrations/1791333000000-BackfillAcceptedJobChats';
import { PersistWorkClockAndSettlement1791400000000 } from './migrations/1791400000000-PersistWorkClockAndSettlement';
import { EnsureCompleteSchema1791600000000 } from './migrations/1791600000000-EnsureCompleteSchema';
import { EnsureUsersGoogleId1791700000000 } from './migrations/1791700000000-EnsureUsersGoogleId';
import { AddAccountDeletion1791800000000 } from './migrations/1791800000000-AddAccountDeletion';
import { AddPayments1791900000000 } from './migrations/1791900000000-AddPayments';
import { AgencyOperations1792000000000 } from './migrations/1792000000000-AgencyOperations';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const rawHost = configService.get<string>('DATABASE_HOST');
        const dbUrl =
          configService.get<string>('DATABASE_URL') ||
          (rawHost?.includes('://') ? rawHost : undefined);

        const connectionConfig = dbUrl
          ? { url: dbUrl }
          : {
              host: configService.getOrThrow<string>('DATABASE_HOST'),
              port: configService.getOrThrow<number>('DATABASE_PORT'),
              username: configService.getOrThrow<string>('DATABASE_USERNAME'),
              password: configService.getOrThrow<string>('DATABASE_PASSWORD'),
              database: configService.getOrThrow<string>('DATABASE_NAME'),
            };

        return {
          type: 'postgres',
          ...connectionConfig,
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
            BackfillAcceptedJobChats1791333000000,
            PersistWorkClockAndSettlement1791400000000,
            EnsureCompleteSchema1791600000000,
            EnsureUsersGoogleId1791700000000,
            AddAccountDeletion1791800000000,
            AddPayments1791900000000,
            AgencyOperations1792000000000,
          ],
          migrationsRun: true,
          migrationsTableName: 'typeorm_migrations',
        };
      },
    }),
  ],
  providers: [DatabaseBootstrapService],
})
export class DatabaseModule {}
