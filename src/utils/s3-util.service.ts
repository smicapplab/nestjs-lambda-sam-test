import { Injectable } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { Upload } from '@aws-sdk/lib-storage';

@Injectable()
export class S3UtilService {
    private s3Client: S3Client;
    private readonly region = 'ap-southeast-1';

    constructor(
        private configService: ConfigService
    ) {
        // const accessKeyId = this.configService.get<string>('PRI_AWS_ACCESS_KEY');
        // const secretAccessKey = this.configService.get<string>('PRI_AWS_SECRET_KEY');

        console.log("########## S3 Constructor ##########")

        this.s3Client = new S3Client({
            region: this.region,
            // credentials: {
            //     accessKeyId,
            //     secretAccessKey
            // }
        });
    }

    decodeBase64(base64String: string) {
        const base64Data = base64String.replace(/^data:([A-Za-z-+/]+);base64,/, '');
        return Buffer.from(base64Data, 'base64');
    }

    async uploadFile({ buffer, fileName, bucket, fileType = "pdf" }) {
        console.log("uploadFile::::::: ", { buffer, fileName, bucket, fileType })
        try {
            const checkUpload = new Upload({
                client: this.s3Client,
                params: {
                    Bucket: bucket,
                    Key: fileName,
                    ...(fileType === "pdf" ? { ContentType: 'application/pdf', ContentDisposition: 'inline' } : {}),
                    Body: buffer
                }
            });

            checkUpload.on('httpUploadProgress', (progress) => {
                console.log(progress);
            });

            await checkUpload.done();
        } catch (e) {
            console.error('uploadToS3 ---->', { e });
        }
    }

    async uploadBase64File({ base64String, fileName, bucket, fileType }) {
        try {
            console.log("uploadBase64File::::::: ", { base64String, fileName, bucket, fileType })
            const buffer = this.decodeBase64(base64String);
            await this.uploadFile({ buffer, fileName, bucket, fileType });
        } catch (error) {
            console.error(error)
            throw error;
        }
    }



    resolveFileType({ name, data }) {
        let fileType = "";
        if (name.toLowerCase().endsWith('.pdf')) {
            fileType = 'pdf';
        } else {
            fileType = data.substring('data:'.length, data.indexOf(';base64')).split('/')[1].toLowerCase();
        }

        return fileType;
    }
}