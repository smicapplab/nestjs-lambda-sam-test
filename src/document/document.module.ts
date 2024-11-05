import { Module } from '@nestjs/common';
import { DocumentService } from './document.service';
import { DocumentController } from './document.controller';
import { SqsUtilService } from 'src/utils/sqs-util.service';
import { S3UtilService } from 'src/utils/s3-util.service';

@Module({
  controllers: [DocumentController],
  providers: [DocumentService, SqsUtilService, S3UtilService],
  exports: [SqsUtilService, S3UtilService],
})
export class DocumentModule { }