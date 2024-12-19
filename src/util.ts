import { Node } from '@babel/types';
import * as fs from 'fs-extra';
import path from 'path';

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

// Define a type for the extracted libraries object
export type ExtractedLibraries = Record<string, string[]>;

export async function saveLibrariesToFile(
    libraries: ExtractedLibraries,
    outputPath: string,
): Promise<void> {
    try {
        // Format the data as JSON
        const data = JSON.stringify(libraries, null, 2); // Pretty print with 2 spaces

        // Write to file
        await fs.writeFile(outputPath, data, 'utf8');
    } catch (error) {
        if (error instanceof Error) {
            console.error(`Failed to save libraries to file: ${error.message}`);
        } else {
            console.error(
                `Failed to save libraries to file due to unknown error: ${error}`,
            );
        }
    }
}
