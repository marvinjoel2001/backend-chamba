import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { PlaceholdersService } from './placeholders.service';

class PlannedApiAreaDto {
  @ApiProperty({ example: 'auth' })
  area: string;

  @ApiProperty({ example: 'pending' })
  status: string;

  @ApiProperty({
    example:
      'Firebase Auth OTP with phone number onboarding for workers and clients.',
  })
  notes: string;
}

@ApiTags('Placeholders')
@Controller('placeholders')
export class PlaceholdersController {
  constructor(private readonly placeholdersService: PlaceholdersService) {}

  @ApiOperation({ summary: 'Listar áreas API planificadas' })
  @ApiOkResponse({ type: PlannedApiAreaDto, isArray: true })
  @Get('planned-apis')
  listPlannedApiAreas() {
    return this.placeholdersService.listPlannedApiAreas();
  }
}
