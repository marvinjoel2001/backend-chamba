import {
  Body,
  Controller,
  Get,
  Param,
  ParseFloatPipe,
  Patch,
  Delete,
  Post,
  Query,
  UseInterceptors,
  UploadedFile,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
// import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'; // Comentado hasta que exista
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { CreateUserDto } from './dto/create-user.dto';
import { ReviewWorkerVerificationDto } from './dto/review-worker-verification.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'Crear usuario' })
  @ApiBody({ type: CreateUserDto })
  @ApiCreatedResponse({ type: User })
  @ApiConflictResponse({
    description: 'Ya existe un usuario con email o teléfono',
  })
  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @ApiOperation({ summary: 'Listar usuarios' })
  @ApiOkResponse({ type: User, isArray: true })
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @ApiOperation({ summary: 'Buscar trabajadores cercanos' })
  @ApiQuery({ name: 'lat', type: Number })
  @ApiQuery({ name: 'lng', type: Number })
  @ApiQuery({ name: 'radiusKm', type: Number, required: false, example: 2 })
  @ApiOkResponse({ type: User, isArray: true })
  @ApiBadRequestResponse({ description: 'radiusKm debe ser mayor a 0' })
  @Get('nearby/workers')
  findNearbyWorkers(
    @Query('lat', ParseFloatPipe) latitude: number,
    @Query('lng', ParseFloatPipe) longitude: number,
    @Query('radiusKm', ParseFloatPipe) radiusKm = 2,
  ) {
    return this.usersService.findNearbyWorkers({
      latitude,
      longitude,
      radiusKm,
    });
  }

  @ApiOperation({
    summary: 'Listar buzon de verificaciones de workers pendientes',
  })
  @ApiOkResponse({ type: User, isArray: true })
  @Get('verification/workers/inbox')
  getWorkerVerificationInbox() {
    return this.usersService.getWorkerVerificationInbox();
  }

  @ApiOperation({
    summary: 'Revisar verificacion de worker (carnet/selfie por separado)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: ReviewWorkerVerificationDto })
  @ApiOkResponse({ type: User })
  @Patch(':id/verification/review')
  reviewWorkerVerification(
    @Param('id') id: string,
    @Body() body: ReviewWorkerVerificationDto,
  ) {
    return this.usersService.reviewWorkerVerification(id, body);
  }

  @ApiOperation({ summary: 'Obtener usuario por id' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: User })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @ApiOperation({ summary: 'Actualizar usuario por id' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateUserDto })
  @ApiOkResponse({ type: User })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado' })
  @ApiConflictResponse({
    description: 'Teléfono ya registrado por otro usuario',
  })
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @ApiOperation({ summary: 'Subir fotos de verificación de identidad' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: User })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado' })
  // @UseGuards(JwtAuthGuard) // Descomentar cuando JwtAuthGuard esté disponible
  @UseInterceptors(FileInterceptor('idPhoto'))
  @Post(':id/verification-photos')
  uploadVerificationPhotos(
    @Param('id') id: string,
    @UploadedFile() idPhoto: any, // any en lugar de Express.Multer.File
    @Body() body: { facePhotoUrl?: string },
  ) {
    return this.usersService.uploadVerificationPhotos(
      id,
      idPhoto,
      body.facePhotoUrl,
    );
  }

  @ApiOperation({ summary: 'Desactivar (soft-delete) usuario por id' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ description: 'Usuario desactivado' })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado' })
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.usersService.softDelete(id);
  }
}
