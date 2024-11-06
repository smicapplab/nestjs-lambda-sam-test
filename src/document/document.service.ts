import { Injectable } from '@nestjs/common';
import { CreateDocumentDto } from './dto/create-document.dto';
import { SqsUtilService } from 'src/utils/sqs-util.service';
import { ConfigService } from '@nestjs/config';
import { TextractUtilService } from 'src/utils/textract-util.service';
import { DynamodbUtilService } from 'src/utils/dynamodb-util.service';
import { now } from 'src/utils/date-helper';
import { S3UtilService } from 'src/utils/s3-util.service';

@Injectable()
export class DocumentService {

  private bucket: string;
  private queueUrl: string;
  private trOcrTableName: string = "tr-demo-ocr";

  constructor(
    private readonly textractUtilService: TextractUtilService,
    private readonly sqsUtilService: SqsUtilService,
    private readonly configService: ConfigService,
    private readonly dynamodbUtilService: DynamodbUtilService,
    private readonly s3UtilService: S3UtilService
  ) {
    this.bucket = this.configService.get<string>('AWS_ISUER_BUCKET');
    this.queueUrl = this.configService.get<string>('AWS_SQS_QUEUE_URL');
  }

  async create(createDocumentDto: CreateDocumentDto) {
    try {
      const { name, fileName, fileType, url, fileId } = createDocumentDto

      const textratctReponse: any = await this.textractUtilService.startTextExtractAsync({
        fileName,
        bucket: this.bucket,
      })

      const today = now().toISOString();
      await this.dynamodbUtilService.updateOne({
        tableName: this.trOcrTableName,
        item: {
          pk: "pam-ocr",
          sk: today,
          fileId,
          currentStep: textratctReponse.$metadata.httpStatusCode === 200 ? "PENDING" : "ERROR",
          gsi1pk: textratctReponse.JobId,
          gsi1sk: today,
          fileName,
          type: fileType,
          url,
          originalFilename: name || "",
        }
      });

      await this.sqsUtilService.sendSqsMessage({
        queueUrl: this.queueUrl,
        messageBody: {
          type: 'PROCESS_DOCUMENT',
          data: {
            jobId: textratctReponse.JobId,
          },
        },
        delaySeconds: 240,
      })

      return {
        success: true,
        url,
      };

    } catch (error) {
      console.error("Error in document.create", error)
    }
  }


  async findOne(jobId: string) {
    try {
      const dynamodbResp = await this.dynamodbUtilService.findByIndex({
        indexName: "gsi1-index",
        query: { gsi1pk: jobId },
        tableName: this.trOcrTableName,
      })

      if (dynamodbResp && dynamodbResp.Items.length > 0) {
        const record = dynamodbResp.Items[0];
        return { data: record, error: null }
      }

      return { data: null, error: `Data not found: ${jobId}` }

    } catch (error) {
      console.error(error);
      return { data: null, error }
    }
  }

  async getDocumentAnalysis(jobId: string) {
    try {
      const { data: record, error: recordErr } = await this.findOne(jobId);

      if (recordErr) {
        console.error(recordErr)
        return { data: null, error: recordErr }
      }

      const { data, error } = await this.textractUtilService.getDocumentBlocks(jobId)

      const fileName = `pam/documents/${record.fileId}/${record.fileId}.blocks.json`
      const buffer = Buffer.from(JSON.stringify(data));
      await this.s3UtilService.uploadFile({
        buffer,
        fileName,
        bucket: this.bucket,
        fileType: "json"
      })

      await this.dynamodbUtilService.updateOne({
        tableName: this.trOcrTableName,
        item: {
          pk: record.pk,
          sk: record.sk,
          currentStep: "PARTIAL:BLOCKS",
          blocks: fileName,
          error
        }
      });

      return { data: `Blocks Saved: ${jobId}`, error };
    } catch (error) {
      console.error(error);
      return { success: false, error }
    }
  }


  async processDocument(data: any) {
    const { error } = await this.getDocumentAnalysis(data?.jobId)
    if (error) {
      return { success: false, error }
    }

    if (!error) {
      await this.sqsUtilService.sendSqsMessage({
        queueUrl: this.queueUrl,
        messageBody: {
          type: 'PARSE_DOCUMENT',
          data: {
            jobId: data?.jobId,
          },
        }
      })
    }

    return {
      success: true,
      message: 'Document processed successfully',
      data: data,
      error: null,
    };
  }

  async parseDocument(data: any) {
    const { error } = await this.parseTextractResponse(data?.jobId)
    if (error) {
      return { success: false, error }
    }

    return {
      success: true,
      message: 'Document processed successfully',
      data: data,
      error: null,
    };
  }

  async parseTextractResponse(jobId: string) {
    try {
      const { data: record, error: recordErr } = await this.findOne(jobId);
      if (recordErr) {
        console.error(recordErr)
        return { data: null, error: recordErr }
      }

      const blocks = await this.s3UtilService.readJsonFileFromS3(this.bucket, record.blocks)
      const { data, error } = await this.textractUtilService.parseTextractResponse(blocks)

      await this.dynamodbUtilService.updateOne({
        tableName: this.trOcrTableName,
        item: {
          pk: record.pk,
          sk: record.sk,
          currentStep: "PARTIAL:PARSED",
          error,
          ...data
        }
      });

      return { data: `Parsed Successfully: ${jobId}`, error };
    } catch (error) {
      console.error(error);
      return { success: false, error }
    }
  }

}
