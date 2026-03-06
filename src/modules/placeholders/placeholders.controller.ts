import { Controller, Get } from '@nestjs/common';
import { PlaceholdersService } from './placeholders.service';

@Controller('placeholders')
export class PlaceholdersController {
  constructor(private readonly placeholdersService: PlaceholdersService) {}

  @Get('planned-apis')
  listPlannedApiAreas() {
    return this.placeholdersService.listPlannedApiAreas();
  }
}
