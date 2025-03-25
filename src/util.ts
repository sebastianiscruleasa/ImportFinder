import * as fs from 'fs/promises';
import { ImportStatement } from './types';

export async function saveImportsToJsonFile(
    importStatements: ImportStatement[],
    outputPath: string,
): Promise<void> {
    try {
        const data = JSON.stringify(importStatements, null, 2);

        await fs.writeFile(outputPath, data, 'utf8');
    } catch (error) {
        if (error instanceof Error) {
            console.error(`Failed to save imports to file: ${error.message}`);
        } else {
            console.error(
                `Failed to save imports to file due to unknown error: ${error}`,
            );
        }
    }
}

export async function saveImportsToCsvFile(
    data: ImportStatement[],
    outputPath: string,
): Promise<void> {
    const headers = Object.keys(data[0]);

    const csvContent = [
        headers.join(','),
        ...data.map(
            (row) =>
                headers
                    .map((header) => {
                        const value = row[header as keyof ImportStatement];
                        if (Array.isArray(value)) {
                            // Join arrays with a delimiter
                            return value.join(' '); // For modifiers: "static wildcard"
                        }
                        const stringValue = String(value ?? '');
                        // Escape fields with commas, quotes, or newlines
                        if (/[,"\n]/.test(stringValue)) {
                            return `"${stringValue.replace(/"/g, '""')}"`;
                        }
                        return stringValue;
                    })
                    .join(','), // Separate fields with commas
        ),
    ].join('\n');

    try {
        await fs.writeFile(outputPath, csvContent, 'utf8');
    } catch (error) {
        console.error(`Failed to save CSV file: ${error}`);
    }
}
