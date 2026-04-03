import { Controller, Post, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Controller('cms/api-keys')
@UseGuards(JwtAuthGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  create(@Body() dto: CreateApiKeyDto) {
    return this.apiKeysService.create(dto);
  }

  @Get()
  findAll() {
    return this.apiKeysService.findAll();
  }

  @Patch(':id/revoke')
  revoke(@Param('id') id: string) {
    return this.apiKeysService.revoke(id);
  }
}
