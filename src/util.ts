import * as fs from 'fs/promises';
import path from 'path';
import { ImportStatement } from './types';
import { javascriptExtensions, javascriptIgnoreList } from './javascriptUtil';
import { javaExtensions, javaIgnoreList } from './javaUtil';

export function getRelativePathToRepo(
    repoPath: string,
    filePath: string,
): string {
    if (filePath.startsWith(repoPath)) {
        return filePath.replace(repoPath, '').replace(/^\//, ''); // Remove repoPath and leading slash
    }
    return filePath; // If the filePath doesn't start with repoPath, return as is
}

export async function getAllFiles(dirPath: string): Promise<string[]> {
    const files = await fs.readdir(dirPath);
    const extensions = [...javascriptExtensions, ...javaExtensions];
    const ignoreList = [...javascriptIgnoreList, ...javaIgnoreList];
    const allFiles: string[] = [];

    for (const file of files) {
        const fullPath = path.join(dirPath, file);

        if (ignoreList.some((ignore) => file.includes(ignore))) {
            continue; // Skip ignored files or directories
        }

        const stat = await fs.stat(fullPath);

        if (stat.isDirectory()) {
            // If it's a directory, recursively get files
            const nestedFiles = await getAllFiles(fullPath);
            allFiles.push(...nestedFiles);
        } else if (extensions.some((ext) => file.endsWith(ext))) {
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

    try {
        await fs.writeFile(outputPath, csvContent, 'utf8');
    } catch (error) {
        console.error(`Failed to save CSV file: ${error}`);
    }
}

export function getLanguageByExtension(extension: string): string {
    const extensionToLanguage: Record<string, string> = {
        '.java': 'Java',
        '.js': 'JavaScript',
        '.ts': 'TypeScript',
        '.jsx': 'JavaScript (JSX)',
        '.tsx': 'TypeScript (TSX)',
    };

    return extensionToLanguage[extension] || 'Unknown';
}
