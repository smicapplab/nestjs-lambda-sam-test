import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    SQSClient,
    SendMessageCommand,
    DeleteMessageCommand,
    SendMessageCommandInput,
} from '@aws-sdk/client-sqs';

@Injectable()
export class SqsUtilService {
    private sqsClient: SQSClient;
    private readonly region = 'ap-southeast-1';

    constructor(private configService: ConfigService) {
        const accessKeyId = this.configService.get<string>('PRI_AWS_ACCESS_KEY');
        const secretAccessKey = this.configService.get<string>('PRI_AWS_SECRET_KEY');

        this.sqsClient = new SQSClient({
            region: this.region,
            endpoint: `https://sqs.${this.region}.amazonaws.com`,
            credentials: {
                accessKeyId,
                secretAccessKey
            }
        });
    }

    getClient(): SQSClient {
        return this.sqsClient;
    }

    async sendSqsMessage({ queueUrl, messageBody, delaySeconds = 0 }: {
        queueUrl: string;
        messageBody: any;
        delaySeconds?: number;
    }) {
        const params: SendMessageCommandInput = {
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify(messageBody),
            ...(delaySeconds ? { DelaySeconds: delaySeconds } : {}),
        };

        try {
            const data = await this.sqsClient.send(new SendMessageCommand(params));
            return data;
        } catch (err) {
            console.error('Detailed error information:', {
                error: err,
                errorType: err.name,
                errorMessage: err.message,
                stackTrace: err.stack,
                params,
            });
            throw err;
        }
    }

    async deleteSqsMessage(queueUrl: string, receiptHandle: string) {
        const params = {
            QueueUrl: queueUrl,
            ReceiptHandle: receiptHandle,
        };

        try {
            const data = await this.sqsClient.send(new DeleteMessageCommand(params));
            return data;
        } catch (err) {
            console.error('Error deleting message from SQS:', err);
            throw err;
        }
    }
}