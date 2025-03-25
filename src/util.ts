import * as fs from 'fs/promises';
import path from 'path';
import { ImportStatement } from './types';

export function getRelativePathToRepo(
    repoPath: string,
    filePath: string,
): string {
    if (filePath.startsWith(repoPath)) {
        return filePath.replace(repoPath, '').replace(/^\//, ''); // Remove repoPath and leading slash
    }
    return filePath; // If the filePath doesn't start with repoPath, return as is
}

export async function groupFilesByExtension(
    dirPath: string,
): Promise<Map<string, string[]>> {
    const groupedFiles = new Map<string, string[]>();

    async function walk(currentPath: string) {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);

            if (isGloballyIgnored(fullPath)) continue;

            if (entry.isDirectory()) {
                await walk(fullPath);
            } else {
                const ext = path.extname(entry.name);
                if (!groupedFiles.has(ext)) {
                    groupedFiles.set(ext, []);
                }
                groupedFiles.get(ext)!.push(fullPath);
            }
        }
    }

    await walk(dirPath);
    return groupedFiles;
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

export function isGloballyIgnored(file: string): boolean {
    return isIgnored(
        file,
        globallyExcludedDirectories,
        globallyExcludedFilePatterns,
    );
}

export function isIgnored(
    file: string,
    excludedDirectories: string[],
    excludedFilePatterns: string[],
): boolean {
    const pathParts = file.split(path.sep);
    const fileName = path.basename(file);

    const isInExcludedDir = pathParts.some((dir) =>
        excludedDirectories.includes(dir),
    );
    const isExcludedFile = excludedFilePatterns.some((pattern) =>
        fileName.endsWith(pattern),
    );

    return isInExcludedDir || isExcludedFile;
}

const globallyExcludedDirectories: string[] = [
    // Build/output
    'target',
    'build',
    'out',
    'dist',

    // IDE/project config
    '.idea',
    '.vscode',
    '.settings',
    '.classpath',
    '.project',

    // Test directories (language-specific test files should be filtered later)
    'src/test',
    '__tests__',
    '__mocks__',

    // Coverage and meta
    'jacoco',
    '.nyc_output',
    'coverage',

    // Dependencies
    'node_modules',
    'lib',
    'libs',

    // Docs/static
    'docs',
    '.next',
    '.turbo',
    '.parcel-cache',
    '.nx',
    'storybook-static',

    // Python/virtual envs
    'venv',
    '__pycache__',
];

const globallyExcludedFilePatterns: string[] = [
    // VCS
    '.git',
    '.svn',
    '.hg',

    // Binary and compiled artifacts
    '*.class',
    '*.jar',
    '*.war',
    '*.ear',
    '*.zip',
    '*.tar.gz',
    '*.kts',

    // Logs, backups, tmp
    '*.log',
    '*.tmp',
    '*.bak',
    '*.swp',

    // Docs/media
    '*.md',
    '*.png',
    '*.jpg',
    '*.jpeg',
    '*.gif',
    '*.svg',
    '*.sql',
];
