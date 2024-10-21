# NestJS AWS Lambda Deployment with AWS SAM

This project is a test deployment of a NestJS application to AWS Lambda using AWS Serverless Application Model (SAM). The project demonstrates how to integrate NestJS with AWS Lambda and deploy it using SAM, allowing you to run a NestJS application serverlessly.

## Prerequisites

Ensure the following tools are installed before starting:

* Node.js: [Download](https://nodejs.org/)
* AWS CLI: [Download](https://aws.amazon.com/cli/)
* AWS SAM CLI: [Download](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html)
* Docker: Optional but recommended for building and testing the Lambda function locally.

## Project Structure

The main components of the project are as follows:

* `src/`: Contains the NestJS source code
* `dist/`: Contains the compiled JavaScript files after building the project
* `template.yaml`: AWS SAM template that defines the Lambda function and API Gateway
* `package.json`: Contains project dependencies

## Setup

1. Install Dependencies:
```bash
npm install
```

2. Build the NestJS Application:
```bash
npm run build
```

3. Set Up AWS CLI:
```bash
aws configure
```

## Deploy to AWS Lambda using SAM

1. Build the SAM package:
```bash
sam build
```

2. Deploy the SAM application:
```bash
sam deploy --guided
```

During this step, you will be asked to provide information such as the stack name, AWS region, and S3 bucket for storing deployment artifacts. The configuration will be saved in `samconfig.toml` for future deployments.

## Access the Deployed Application

Once the deployment is successful, AWS SAM will output the API Gateway URL. You can test the application by making requests to that URL. For example:

```bash
curl https://<api-gateway-id>.execute-api.<region>.amazonaws.com/Prod/users
```

## Project Configuration

### template.yaml
This file defines the AWS resources for the project, including the Lambda function and API Gateway.

Example template.yaml snippet:
```yaml
Resources:
  NestJsLambdaFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: dist/lambda.handler
      Runtime: nodejs18.x
      CodeUri: ./dist
      MemorySize: 512
      Timeout: 30
      Events:
        Api:
          Type: Api
          Properties:
            Path: /{proxy+}
            Method: ANY
```

### tsconfig.json
This file contains TypeScript compiler options. The compiled files are output to the `dist/` directory, which is then used by AWS Lambda.

### package.json
Make sure you install all necessary production dependencies, as these will be deployed to Lambda along with your application code.

## Local Development

1. Run NestJS Locally:
```bash
npm run start
```

2. Test Lambda Locally with SAM CLI:
```bash
sam local invoke NestJsLambdaFunction
```

## Cleaning Up

To remove the deployed stack from AWS, use the following command:
```bash
sam delete --stack-name <your-stack-name>
```

This will clean up all the resources associated with the deployment.

## Troubleshooting

* "Cannot find module" errors: Ensure that all dependencies are installed correctly and included in the deployment package.
* API Gateway 500 errors: Check AWS CloudWatch logs for Lambda to get detailed error information.

## License

This project is licensed under the MIT License.