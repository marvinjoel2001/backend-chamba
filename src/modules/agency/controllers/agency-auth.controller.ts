import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AgencyAuthService } from '../services/agency-auth.service';
import { AgencyLoginDto } from '../dto/agency-login.dto';
import { AgencyChangePasswordDto } from '../dto/agency-change-password.dto';
import { AgencyJwtAuthGuard } from '../guards/agency-jwt-auth.guard';
import { CurrentAgency } from '../decorators/current-agency.decorator';
import type { AgencyPrincipal } from '../strategies/agency-jwt.strategy';

@ApiTags('agency')
@Controller('agency/auth')
export class AgencyAuthController {
  constructor(private readonly agencyAuthService: AgencyAuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Login del panel de agencias (JWT)' })
  login(@Body() loginDto: AgencyLoginDto) {
    return this.agencyAuthService.login(loginDto);
  }

  @Get('me')
  @UseGuards(AgencyJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Perfil de la agencia autenticada' })
  me(@CurrentAgency() agency: AgencyPrincipal) {
    return this.agencyAuthService.getProfile(agency.agencyId);
  }

  @Post('change-password')
  @UseGuards(AgencyJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cambiar la contraseña de la agencia' })
  changePassword(
    @CurrentAgency() agency: AgencyPrincipal,
    @Body() dto: AgencyChangePasswordDto,
  ) {
    return this.agencyAuthService.changePassword(agency.agencyId, dto);
  }
}
