import { Injectable } from '@nestjs/common';
import { CreateDocumentDto } from './dto/create-document.dto';
import { SqsUtilService } from 'src/utils/sqs-util.service';
import { ConfigService } from '@nestjs/config';
import { TextractUtilService } from 'src/utils/textract-util.service';
import { DynamodbUtilService } from 'src/utils/dynamodb-util.service';
import { now } from 'src/utils/date-helper';
import { S3UtilService } from 'src/utils/s3-util.service';
import { OpenAI } from 'openai';

@Injectable()
export class DocumentService {

  private bucket: string;
  private queueUrl: string;
  private trOcrTableName: string = "tr-demo-ocr";
  private openaiKey: string;
  private openai: OpenAI;

  constructor(
    private readonly textractUtilService: TextractUtilService,
    private readonly sqsUtilService: SqsUtilService,
    private readonly configService: ConfigService,
    private readonly dynamodbUtilService: DynamodbUtilService,
    private readonly s3UtilService: S3UtilService
  ) {
    this.bucket = this.configService.get<string>('AWS_ISUER_BUCKET');
    this.queueUrl = this.configService.get<string>('AWS_SQS_QUEUE_URL');
    this.openaiKey = this.configService.get<string>('OPENAI_API_KEY')
    this.openai = new OpenAI({
      apiKey: this.openaiKey, // Ensure this environment variable is set
    });
  }


  async findAll({ parsedKey, status }: { parsedKey: any, status: string }) {

    if (status) {
      //@ts-ignore
      const record = await this.dynamodbUtilService.findByIndex({
        indexName: "currentStep-index",
        query: { currentStep: status },
        tableName: this.trOcrTableName,
        lastEvaluatedKey: parsedKey,
        limit: 5,
        sort: "DESC"
      })

      return record;
    } else {
      const records = await this.dynamodbUtilService.find({
        pk: "pam-ocr",
        tableName: this.trOcrTableName,
        limit: 5,
        sort: "DESC",
        lastEvaluatedKey: parsedKey
      })

      return records;
    }
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
      //@ts-ignore
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
      console.error("document.service:::findOne", error);
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

    await this.sqsUtilService.sendSqsMessage({
      queueUrl: this.queueUrl,
      messageBody: {
        type: 'REFINE_DOCUMENT',
        data: {
          jobId: data?.jobId,
        },
      }
    })

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

  private cleanResponse = (response) => {
    // Remove common prefixes and suffixes
    return response.replace(/^'''json|```json|```|'''/g, "").trim();
  };

  private parseJSON = (response) => {
    try {
      const cleanedResponse = this.cleanResponse(response);
      return JSON.parse(cleanedResponse);
    } catch (error) {
      console.error("Error parsing JSON:", error.message);
      console.error("Raw Response:", response);
      return null; // Return null or handle the error as needed
    }
  };

  private classifyDocument = async (text) => {
    try {
      let response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini", // Use GPT-4 if available for better performance
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful assistant who classify, extract, and summarize the following document into one of these categories (e.g., legal, financial, marketing), classification (e.g., Purchase Prder, Credit Assessment Memo, Invoice, Receipt, Contract, or Unknown.) ',
          },
          {
            role: 'user',
            content: `
                    Generate summary, pages count, relevant dates, numbers, contact information, and category and other information:
                    Content: ${text}
                    Output format:
                        { "summary": "Question 1", "classification": "", "category": "Answer 1", pagesCount: 0, relevantDates: [{ label: Expiration, date: 'Iso date'  }], contact: [{fullName: "Alex Sy", number: "63918765432", email: "" }],            
                `,
          },
        ],
        max_tokens: 1000,
        temperature: 0.7,
      });

      const openaiResponse = response.choices[0].message.content;
      const parsedData = this.parseJSON(openaiResponse);
      console.log(parsedData)
      return parsedData;
    } catch (error) {
      console.error("Error classifying document with OpenAI:", error);
      throw error;
    }
  };

  private extractTextFromBlocks = (blocks: any) => {
    return blocks
      .filter(block => block.BlockType === "LINE") // Get only LINE blocks
      .map(block => block.Text) // Extract the text content
      .join(" "); // Combine into a single string
  };

  async refineTextractResponse(jobId: string) {
    try {
      const { data: record, error: recordErr } = await this.findOne(jobId);
      if (recordErr) {
        console.error(recordErr)
        return { data: null, error: recordErr }
      }

      const blocks = await this.s3UtilService.readJsonFileFromS3(this.bucket, record.blocks)
      const text = this.extractTextFromBlocks(blocks)
      const { summary, classification, category, relevantDates, pagesCount, contact,  } = await this.classifyDocument(text)

      const { accountName, businessName } = record.form
      const searchSk = `${accountName} ${businessName}`.toLowerCase()

      await this.dynamodbUtilService.updateOne({
        tableName: this.trOcrTableName,
        item: {
          pk: record.pk,
          sk: record.sk,
          currentStep: "PARTIAL:CLASSIFIED",
          searchPk: "cam-search",
          searchSk,
          summary, 
          classification, 
          category, 
          relevantDates, 
          pagesCount, 
          contact
        }
      });

      return { data: `Refined Successfully: ${jobId}` };
    } catch (error) {
      console.error(error);
      return { success: false, error }
    }
  }

  async refineDocument(data: any) {
    const { error } = await this.refineTextractResponse(data?.jobId)
    if (error) {
      return { success: false, error }
    }

    return {
      success: true,
      message: 'Document refined successfully',
      data: data,
      error: null,
    };
  }

  async getItemCount() {
    const response = await this.dynamodbUtilService.getItemCount(this.trOcrTableName)
    return response
  }

}
