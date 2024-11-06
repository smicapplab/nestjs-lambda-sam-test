import { Module } from '@nestjs/common';
import { DocumentService } from './document.service';
import { DocumentController } from './document.controller';
import { SqsUtilService } from 'src/utils/sqs-util.service';
import { TextractUtilService } from 'src/utils/textract-util.service';
import { ConfigService } from '@nestjs/config';
import { DynamodbUtilService } from 'src/utils/dynamodb-util.service';
import { S3UtilService } from 'src/utils/s3-util.service';

@Module({
  controllers: [DocumentController],
  providers: [DocumentService, SqsUtilService, TextractUtilService, ConfigService, DynamodbUtilService, S3UtilService],
  exports: [SqsUtilService, TextractUtilService, ConfigService, DynamodbUtilService, S3UtilService],
})

export class DocumentModule { }