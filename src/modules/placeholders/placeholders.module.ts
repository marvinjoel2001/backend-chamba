import { Module } from '@nestjs/common';
import { PlaceholdersController } from './placeholders.controller';
import { PlaceholdersService } from './placeholders.service';

@Module({
  controllers: [PlaceholdersController],
  providers: [PlaceholdersService],
})
export class PlaceholdersModule {}
