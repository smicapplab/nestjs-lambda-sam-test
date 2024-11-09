import { FeatureType, GetDocumentAnalysisCommand, StartDocumentAnalysisCommand, TextractClient } from "@aws-sdk/client-textract";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type Block = {
    Id: string;
    BlockType: 'WORD' | 'LINE' | 'KEY_VALUE_SET' | 'TABLE' | 'CELL' | string;
    Text?: string;
    Confidence?: number;
    RowIndex?: number;
    Page?: number;
    ColumnIndex?: number;
    EntityTypes?: string[];
    Relationships?: Relationship[];
};

type Relationship = {
    Type: string;
    Ids: string[];
};

type Fields = { [key: string]: string };
type Table = string[][];

@Injectable()
export class TextractUtilService {
    private textractClient: TextractClient;
    private readonly region = 'ap-southeast-1';

    constructor(
        private configService: ConfigService,
    ) {
        const accessKeyId = this.configService.get<string>('PRI_AWS_ACCESS_KEY');
        const secretAccessKey = this.configService.get<string>('PRI_AWS_SECRET_KEY');

        this.textractClient = new TextractClient({
            region: this.region,
            credentials: {
                accessKeyId,
                secretAccessKey
            }
        });
    }

    async startTextExtractAsync({
        fileName,
        featureTypes = [FeatureType.FORMS, FeatureType.TABLES],
        bucket,
    }) {
        try {
            let FeatureTypes = featureTypes;
            const input = {
                DocumentLocation: {
                    S3Object: {
                        Bucket: bucket,
                        Name: fileName,
                    },
                },
                FeatureTypes,
            };

            const command = new StartDocumentAnalysisCommand(input);
            const data = await this.textractClient.send(command);
            return data;
        } catch (err) {
            console.error(err);
            return {
                success: false,
                message: "Error starting text extraction",
                error: err,
            };
        }
    }

    async getDocumentBlocks(jobId: string) {
        try {
            let nextToken = undefined;
            const allBlocks = [];

            do {
                const params = {
                    JobId: jobId,
                    NextToken: nextToken,
                };

                const command = new GetDocumentAnalysisCommand(params);
                try {
                    const response = await this.textractClient.send(command);
                    allBlocks.push(...response.Blocks);
                    nextToken = response.NextToken; // Update nextToken for pagination
                } catch (error) {
                    console.error("Error getting document analysis:", error);
                    return { data: [], error: error };
                }
            } while (nextToken);

            return { data: allBlocks, error: null };
        } catch (error) {
            return { data: null, error };
        }
    }


    removeColonOrSemicolonAtEnd = (str: string): string => {
        return this.toCamelCase(str.replace(/[:;]$/, '').trim());
    }

    toCamelCase = (str: string): string => {
        return str
            .toLowerCase()
            .split(/[\s_\-\.]+/)
            .map((word, index) => {
                if (index === 0) {
                    return word;
                }
                return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join('');
    }

    parseForm(blocks: Block[]): Fields {
        const fields: Fields = {};

        // Create a map of blocks for easy access
        const blockMap: { [id: string]: Block } = {};
        blocks.forEach(block => {
            blockMap[block.Id] = block;
        });

        // Iterate over each block to find key-value pairs
        blocks.forEach(block => {
            if (block.BlockType === 'KEY_VALUE_SET' && block.EntityTypes?.includes('KEY')) {
                const key = this.removeColonOrSemicolonAtEnd(this.getText(block, blockMap));
                const valueBlock = block.Relationships?.find(rel => rel.Type === 'VALUE');
                // Check if key is not empty
                if (key) {
                    const valueBlock = block.Relationships?.find(rel => rel.Type === 'VALUE');
                    if (valueBlock && valueBlock.Ids.length > 0) {
                        const value = this.getText(blockMap[valueBlock.Ids[0]], blockMap);
                        fields[key] = value ?? "";
                    }
                }
            }
        });

        return fields;
    }

    // Helper function to extract text from a block, handling child relationships if present
    private getText(block: Block, blockMap: { [id: string]: Block }): string {
        if (block.BlockType === 'WORD' || block.BlockType === 'LINE') {
            return block.Text || '';
        }

        if (block.Relationships) {
            const text = block.Relationships
                .filter(rel => rel.Type === 'CHILD')
                .flatMap(rel => rel.Ids.map(id => blockMap[id].Text || ''))
                .join(' ');
            return text;
        }

        return '';
    }

    parseTable(blocks: Block[]): Table[] {
        const tables: Table[] = [];
        const blockMap: { [id: string]: Block } = {};

        // Organize blocks into a map for easy access
        blocks.forEach(block => {
            blockMap[block.Id] = block;
        });

        // Extract table blocks
        blocks.forEach(block => {
            if (block.BlockType === 'TABLE') {
                const table = this.extractTable(block, blockMap);
                tables.push(table);
            }
        });

        return tables;
    }

    // Helper function to extract a single table structure
    private extractTable(tableBlock: Block, blockMap: { [id: string]: Block }): Table {
        const cells: Block[] = [];
        const table: Table = [];

        // Retrieve all CELL blocks related to this table
        tableBlock.Relationships?.forEach(relationship => {
            if (relationship.Type === 'CHILD') {
                relationship.Ids.forEach(id => {
                    const cellBlock = blockMap[id];
                    if (cellBlock && cellBlock.BlockType === 'CELL') {
                        cells.push(cellBlock);
                    }
                });
            }
        });

        // Organize cells into rows and columns
        cells.forEach(cell => {
            const rowIndex = cell.RowIndex ?? 0;
            const colIndex = cell.ColumnIndex ?? 0;
            const cellText = this.getText(cell, blockMap);

            // Ensure the row exists in the table
            if (!table[rowIndex - 1]) {
                table[rowIndex - 1] = [];
            }

            // Assign text to the appropriate column in the row
            table[rowIndex - 1][colIndex - 1] = cellText;
        });

        return table;
    }

    calculateAverageConfidence(blocks: Block[]): number {
        const confidenceScores = blocks
            .filter(block => block.Confidence !== undefined)
            .map(block => block.Confidence as number);

        if (confidenceScores.length === 0) return 0;
        const totalConfidence = confidenceScores.reduce((sum, score) => sum + score, 0);
        return totalConfidence / confidenceScores.length;
    }

    extractHandwrittenSentences(blocks: Block[]): { page: number; confidence: number; sentence: string }[] {
        const handwrittenThreshold = 85;
        const sentences: { page: number; confidence: number; sentence: string }[] = [];

        // Filter out lines with confidence below the threshold
        const lineBlocks = blocks.filter(
            block => block.BlockType === 'LINE' && block.Confidence !== undefined && block.Confidence < handwrittenThreshold
        );

        lineBlocks.forEach(lineBlock => {
            const wordIds = lineBlock.Relationships?.find(rel => rel.Type === 'CHILD')?.Ids || [];
            const wordsWithConfidence = wordIds
                .map(id => blocks.find(block => block.Id === id && block.BlockType === 'WORD'))
                .filter((word): word is Block => !!word && typeof word.Text === 'string');

            // Extract words and calculate the average confidence
            const words = wordsWithConfidence.map(word => word.Text);
            const averageConfidence = wordsWithConfidence.reduce((sum, word) => sum + (word.Confidence ?? 0), 0) / wordsWithConfidence.length;

            // Combine words into a sentence
            if (words.length > 0) {
                const sentence = words.join(' ');
                sentences.push({
                    page: lineBlock.Page ?? 1,
                    confidence: parseFloat(averageConfidence.toFixed(2)),
                    sentence
                });
            }
        });

        return sentences;
    }

    async parseTextractResponse(blocks: any) {
        try {
            const form = this.parseForm(blocks)
            const table = this.parseTable(blocks);
            const confidence = this.calculateAverageConfidence(blocks)
            let handwritten = this.extractHandwrittenSentences(blocks)

            return { data: { form, table, confidence, handwritten }, error: null }
        } catch (error) {
            console.error(error)
            return { data: null, error }
        }
    }
}