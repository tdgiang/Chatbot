import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, HttpCode, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChunksService } from './chunks.service';
import { ChunkQueryDto } from './dto/chunk-query.dto';
import { CreateChunkDto } from './dto/create-chunk.dto';
import { UpdateChunkDto } from './dto/update-chunk.dto';

@Controller('cms/documents/:documentId/chunks')
@UseGuards(JwtAuthGuard)
export class ChunksController {
  constructor(private readonly chunksService: ChunksService) {}

  @Get()
  list(@Param('documentId') documentId: string, @Query() query: ChunkQueryDto) {
    return this.chunksService.list(documentId, query);
  }

  @Get(':chunkId')
  findOne(@Param('documentId') documentId: string, @Param('chunkId') chunkId: string) {
    return this.chunksService.findOne(documentId, chunkId);
  }

  @Post()
  create(@Param('documentId') documentId: string, @Body() dto: CreateChunkDto) {
    return this.chunksService.create(documentId, dto);
  }

  @Patch(':chunkId')
  update(
    @Param('documentId') documentId: string,
    @Param('chunkId') chunkId: string,
    @Body() dto: UpdateChunkDto,
  ) {
    return this.chunksService.update(documentId, chunkId, dto);
  }

  @Patch(':chunkId/toggle')
  @HttpCode(200)
  toggle(@Param('documentId') documentId: string, @Param('chunkId') chunkId: string) {
    return this.chunksService.toggle(documentId, chunkId);
  }

  @Delete(':chunkId')
  remove(@Param('documentId') documentId: string, @Param('chunkId') chunkId: string) {
    return this.chunksService.remove(documentId, chunkId);
  }
}
