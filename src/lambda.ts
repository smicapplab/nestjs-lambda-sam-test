import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as express from 'express';
import { DocumentService } from './document/document.service';
const serverlessExpress = require('@vendia/serverless-express'); // Use require instead of import

let server: any;
let app: any;

async function bootstrap() {
  const expressApp = express();
  app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));
  await app.init();
  return serverlessExpress({ app: expressApp }); // This should now be recognized as a function
}


async function handleSQSEvent(record: any) {
  try {
    // Get the DocumentService from the Nest.js context
    const documentService = app.get(DocumentService);

    // Parse the message body
    const messageBody = JSON.parse(record.body);
    // Process the message based on some condition or type
    switch (messageBody.type) {
      case 'PROCESS_DOCUMENT':
        await documentService.processDocument(messageBody.data);
        break;
      case 'PARSE_DOCUMENT':
        await documentService.parseDocument(messageBody.data);
        break;
      case 'REFINE_DOCUMENT':
        await documentService.refineDocument(messageBody.data);
        break;  
      default:
        console.log('Unknown message type:', messageBody.type);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Successfully processed SQS message' }),
    };
  } catch (error) {
    console.error('Error processing SQS message:', error);
    throw error;
  }
}

export const handler = async (event: any, context: any) => {

  context.callbackWaitsForEmptyEventLoop = false;
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    if (!server) {
      server = await bootstrap();
    }

    // Check if the event is from SQS
    if (event.Records && event.Records[0]?.eventSource === 'aws:sqs') {
      // Process each SQS record
      const results = await Promise.all(
        event.Records.map((record: any) => handleSQSEvent(record))
      );

      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': true,
        },
        body: JSON.stringify({ results }),
      };
    }

    const response = await server(event, context);

    // Add CORS headers to the server response
    response.headers = {
      ...response.headers,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    };

    return response;
  } catch (error) {
    console.error('Error in lambda handler:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: JSON.stringify({
        message: 'Internal server error',
        error: error.message
      }),
    };
  }
};