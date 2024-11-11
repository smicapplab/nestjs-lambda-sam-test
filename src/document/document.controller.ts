import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { DocumentService } from './document.service';
import { CreateDocumentDto } from './dto/create-document.dto';

@Controller('document')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) { }

  @Get()
  async findAll(
    @Query('lastEvaluatedKey') lastEvaluatedKey?: string,
    @Query('status') status?: string
  ) {
    const parsedKey = lastEvaluatedKey ? JSON.parse(lastEvaluatedKey) : undefined;
    return await this.documentService.findAll({ parsedKey, status });
  }

  @Post()
  async create(@Body() createDocumentDto: CreateDocumentDto) {
    return await this.documentService.create(createDocumentDto);
  }

  @Patch(':id')
  async update(@Param('id') jobId: string, @Body() data: any) {
    return await this.documentService.parseTextractResponse(jobId);
  }

  @Post('count')
  async count() {
    const count = await this.documentService.getItemCount();
    return count;
  }
}