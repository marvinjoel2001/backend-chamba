import {
  Body,
  Controller,
  Get,
  Param,
  ParseFloatPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }
}
