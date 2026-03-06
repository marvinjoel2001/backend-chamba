import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseBootstrapService } from './database.bootstrap.service';

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
      }),
    }),
  ],
  providers: [DatabaseBootstrapService],
})
export class DatabaseModule {}
