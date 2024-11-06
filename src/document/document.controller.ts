import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { DocumentService } from './document.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';

@Controller('document')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) { }

  @Post()
  async create(@Body() createDocumentDto: CreateDocumentDto) {
    return await this.documentService.create(createDocumentDto);
  }


  @Patch(':id')
  update(@Param('id') jobId: string, @Body() data: any) {
    return this.documentService.parseTextractResponse(jobId);
  }
}