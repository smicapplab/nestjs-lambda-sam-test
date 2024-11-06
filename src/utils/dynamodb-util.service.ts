import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, PutCommandOutput, UpdateCommandOutput, QueryCommand } from '@aws-sdk/lib-dynamodb';

interface DynamoItem {
    pk: string;
    sk?: string;
    [key: string]: any;
}

interface CreateParams {
    item: DynamoItem;
    tableName: string;
}

interface FindOneParams {
    pk: string;
    sk?: string;
    tableName: string;
}

interface UpdateOneParams {
    item: DynamoItem;
    tableName: string;
    updateOnly?: boolean;
}

@Injectable()
export class DynamodbUtilService {

    private documentClient: DynamoDBDocumentClient;
    private readonly region = 'ap-southeast-1';

    private readonly marshallOptions = {
        convertEmptyValues: false,
        removeUndefinedValues: true,
        convertClassInstanceToMap: false,
    };

    private readonly unmarshallOptions = {
        wrapNumbers: false,
    };

    private translateConfig = { marshallOptions: this.marshallOptions, unmarshallOptions: this.unmarshallOptions };

    constructor(
        private configService: ConfigService
    ) {
        const accessKeyId = this.configService.get<string>('PRI_AWS_ACCESS_KEY');
        const secretAccessKey = this.configService.get<string>('PRI_AWS_SECRET_KEY');

        const dynamoDBClient = new DynamoDBClient({
            region: this.region,
            credentials: {
                accessKeyId,
                secretAccessKey
            }
        });

        this.documentClient = DynamoDBDocumentClient.from(dynamoDBClient, this.translateConfig);
    }

    async create({ item, tableName }: CreateParams): Promise<PutCommandOutput> {
        const params = {
            Item: item,
            TableName: tableName,
        };

        try {
            const response = await this.documentClient.send(new PutCommand(params));
            return response;
        } catch (error) {
            throw new Error(error instanceof Error ? error.stack : 'Unknown error');
        }
    }

    async findOne({ pk, sk, tableName }: FindOneParams): Promise<DynamoItem | null> {
        let params = {
            TableName: tableName,
            Key: {
                pk,
            },
        };

        try {
            if (sk) {
                params.Key["sk"] = sk;
            }

            const data = await this.documentClient.send(new GetCommand(params));
            return data.Item as DynamoItem || null;
        } catch (error) {
            console.error(error, params);
            return null;
        }
    }

    async updateOne({ item, tableName, updateOnly = false }: UpdateOneParams): Promise<UpdateCommandOutput | null> {
        if (updateOnly) {
            const currentData = await this.findOne({
                tableName,
                pk: item.pk,
                ...(item.sk ? { sk: item.sk } : {}),
            });

            if (!currentData) {
                throw new Error("Data does not exist");
            }
        }

        const itemKeys = Object.keys(item).filter((k) => k !== "pk" && k !== "sk");
        let params: any = {
            TableName: tableName,
            UpdateExpression: `SET ${itemKeys
                .map((k, index) => `#field${index} = :value${index}`)
                .join(", ")}`,
            ExpressionAttributeNames: itemKeys.reduce(
                (accumulator, k, index) => ({
                    ...accumulator,
                    [`#field${index}`]: k,
                }),
                {}
            ),
            ExpressionAttributeValues: itemKeys.reduce(
                (accumulator, k, index) => ({
                    ...accumulator,
                    [`:value${index}`]: item[k],
                }),
                {}
            ),
            ReturnValues: "ALL_NEW",
        };

        try {
            params = {
                ...params,
                Key: {
                    pk: item.pk,
                    ...(item.sk ? { sk: item.sk } : {}),
                },
            };

            //console.log(params);
            const response = await this.documentClient.send(new UpdateCommand(params));
            return response;
        } catch (error) {
            console.error(error, { params }, { item });
            return null;
        }
    }

    async findByIndex({
        indexName,
        query,
        limit,
        tableName,
        lastEvaluatedKey = null,
        fromDate = null,
        toDate = null,
        range = null,
        FilterExpression,
        ExpressionAttributeValues,
        sort = "ASC",
    }: {
        indexName?: string;
        query: Record<string, any>;
        limit?: number;
        tableName: string;
        lastEvaluatedKey?: Record<string, any> | null;
        fromDate?: string | null;
        toDate?: string | null;
        range?: string | null;
        FilterExpression?: string;
        ExpressionAttributeValues?: Record<string, any>;
        sort?: "ASC" | "DESC";
    }): Promise<any> {
        const queryKeys = Object.keys(query);
        const params: any = {
            TableName: tableName,
            ScanIndexForward: sort === "ASC",
            KeyConditionExpression: `${queryKeys
                .map((k, index) => `${k} = :value${index}`)
                .join(" AND ")}${fromDate ? ` AND ${range} BETWEEN :fromDate AND :toDate` : ""}`,
            ExpressionAttributeValues: {
                ...queryKeys.reduce(
                    (acc, k, index) => ({
                        ...acc,
                        [`:value${index}`]: query[k],
                    }),
                    {}
                ),
                ...(fromDate ? { ":fromDate": fromDate, ":toDate": toDate } : {}),
            },
        };

        if (indexName) params.IndexName = indexName;
        if (limit) params.Limit = limit;
        if (lastEvaluatedKey) params.ExclusiveStartKey = lastEvaluatedKey;
        if (FilterExpression) params.FilterExpression = FilterExpression;
        if (ExpressionAttributeValues) {
            params.ExpressionAttributeValues = {
                ...params.ExpressionAttributeValues,
                ...ExpressionAttributeValues,
            };
        }

        try {
            const data = await this.documentClient.send(new QueryCommand(params));
            return {
                ...data,
                LastEvaluatedKey: data.LastEvaluatedKey || null,
            };
        } catch (error) {
            console.error("Error executing query:", error);
            throw new Error("Failed to execute query");
        }
    }

}