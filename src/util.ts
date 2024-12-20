import { Node } from '@babel/types';
import * as fs from 'fs-extra';
import path from 'path';
import { ImportStatement } from './types';

export function isStringLiteral(node: Node) {
    return node.type === 'StringLiteral';
}

export function removeRepoPath(repoPath: string, filePath: string): string {
    if (filePath.startsWith(repoPath)) {
        return filePath.replace(repoPath, '').replace(/^\//, ''); // Remove repoPath and leading slash
    }
    return filePath; // If the filePath doesn't start with repoPath, return as is
}

export async function getAllFiles(
    dirPath: string,
    extensions: string[],
    ignoreList: string[],
): Promise<string[]> {
    const files = await fs.readdir(dirPath);
    const allFiles: string[] = [];

    for (const file of files) {
        const fullPath = path.join(dirPath, file);

        // Check if the file or folder is in the ignore list
        if (ignoreList.some((ignore) => file.includes(ignore))) {
            continue; // Skip ignored files or directories
        }

        const stat = await fs.stat(fullPath);

        if (stat.isDirectory()) {
            // If it's a directory, recursively get files
            const nestedFiles = await getAllFiles(
                fullPath,
                extensions,
                ignoreList,
            );
            allFiles.push(...nestedFiles);
        } else if (extensions.some((ext) => file.endsWith(ext))) {
            // If it's a file with the desired extension, add it
            allFiles.push(fullPath);
        }
    }

    return allFiles;
}

export async function saveImportsToJsonFile(
    importStatements: ImportStatement[],
    outputPath: string,
): Promise<void> {
    try {
        // Format the data as JSON
        const data = JSON.stringify(importStatements, null, 2); // Pretty print with 2 spaces

        // Write to file
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
    filePath: string,
): Promise<void> {
    // Extract headers from object keys
    const headers = Object.keys(data[0]);

    // Create the CSV content
    const csvContent = [
        headers.join(','), // Add headers row
        ...data.map(
            (row) =>
                headers
                    .map((header) => {
                        const value = row[header as keyof ImportStatement];
                        if (Array.isArray(value)) {
                            // Join arrays with a delimiter
                            return value.join(' '); // For modifiers: "static wildcard"
                        }
                        const stringValue = String(value || '');
                        // Escape fields with commas, quotes, or newlines
                        if (/[,"\n]/.test(stringValue)) {
                            return `"${stringValue.replace(/"/g, '""')}"`;
                        }
                        return stringValue;
                    })
                    .join(','), // Separate fields with commas
        ),
    ].join('\n');

    // Write the CSV content to file
    try {
        await fs.writeFile(filePath, csvContent, 'utf8');
        console.log(`Data saved as CSV to ${filePath}`);
    } catch (error) {
        console.error(`Failed to save CSV file: ${error}`);
    }
}

export function getLanguageByExtension(extension: string): string {
    const extensionToLanguage: Record<string, string> = {
        '.java': 'Java',
        '.kt': 'Kotlin',
        '.kts': 'Kotlin',
        '.groovy': 'Groovy',
        '.scala': 'Scala',
        '.js': 'JavaScript',
        '.ts': 'TypeScript',
        '.jsx': 'JavaScript (JSX)',
        '.tsx': 'TypeScript (TSX)',
    };

    return extensionToLanguage[extension] || 'Unknown';
}
