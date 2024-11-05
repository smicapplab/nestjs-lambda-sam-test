import { Injectable } from '@nestjs/common';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { SqsUtilService } from 'src/utils/sqs-util.service';
import { S3UtilService } from 'src/utils/s3-util.service';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DocumentService {

  private bucket: string;
  private docUrl: string;
  private queueUrl: string;

  constructor(
    private readonly sqsUtilService: SqsUtilService,
    private readonly s3UtilService: S3UtilService,
    private readonly configService: ConfigService
  ) {
    this.bucket = this.configService.get<string>('AWS_ISUER_BUCKET');
    this.docUrl = this.configService.get<string>('PUBLIC_ISSUER_DOC_URL');
    this.queueUrl = this.configService.get<string>('AWS_SQS_QUEUE_URL');
  }

  async create(createDocumentDto: CreateDocumentDto) {
    const { name, type, data } = createDocumentDto

    let fileType = this.s3UtilService.resolveFileType({ name, data });
    const fileName = `pam/documents/${uuidv4()}.${fileType}`

    await this.s3UtilService.uploadBase64File({
      base64String: data,
      fileName,
      bucket: this.bucket,
      fileType,
    })

    const url = `${this.docUrl}/${fileName}`

    return {
      success: true,
      url,
    };
  }

  async findAll() {
    const queueUrl = this.queueUrl;
    const messageBody = {
      type: 'PROCESS_DOCUMENT',
      data: {
        documentId: '123',
        documentUrl: 'https://example.com/doc.pdf',
        metadata: {
          metadata1: "metadata1",
          metadata2: "metadata2"
        }
      }
    };
    const delaySeconds = 10;

    const result = await this.sqsUtilService.sendSqsMessage(queueUrl, messageBody, delaySeconds);
    console.log('Message sent:', result);

    return { result, messageBody };
  }

  async findOne(id: number) {
    return `This action returns a #${id} document`;
  }

  async update(id: number, updateDocumentDto: UpdateDocumentDto) {
    return `This action updates a #${id} document`;
  }

  async remove(id: number) {
    return `This action removes a #${id} document`;
  }

  async processDocument(data: any) {

    console.log("++++++++++++++++++++++++++")
    console.log("++++++++++++++++++++++++++")

    console.log("++++++    HELLO    +++++++")


    console.log("++++++++++++++++++++++++++")
    console.log("++++++++++++++++++++++++++")

    return {
      success: true,
      message: 'Document processed successfully',
      data: data
    };
  }
}
