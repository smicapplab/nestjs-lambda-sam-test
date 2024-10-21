import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as express from 'express';
const serverlessExpress = require('@vendia/serverless-express'); // Use require instead of import

let server: any;

async function bootstrap() {
  const expressApp = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));
  await app.init();
  return serverlessExpress({ app: expressApp }); // This should now be recognized as a function
}

export const handler = async (event: any, context: any) => {
  if (!server) {
    server = await bootstrap();
  }
  return server(event, context);
};