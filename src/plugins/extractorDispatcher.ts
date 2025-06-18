import { LanguageExtractor } from '../types';
import fs from 'fs/promises';
import path from 'path';
import { isIgnored } from './plugin.util';
import { builtinPlugins } from './plugin-loader';

export async function groupFilesByExtractor(
    repoPath: string,
): Promise<Map<LanguageExtractor, string[]>> {
    const groupedFilesByExtensions = await groupFilesByExtension(repoPath);
    const extensions = Array.from(groupedFilesByExtensions.keys());
    const extractorToFilesMap = new Map<LanguageExtractor, string[]>();

    const handledExtensions = new Set<string>();

    for (const plugin of builtinPlugins) {
        if (plugin.extensions.some((ext) => extensions.includes(ext))) {
            const extractor = await plugin.createExtractor(
                groupedFilesByExtensions,
            );
            const files = plugin.extensions.flatMap(
                (ext) => groupedFilesByExtensions.get(ext) ?? [],
            );
            extractorToFilesMap.set(extractor, files);
            plugin.extensions.forEach((ext) => handledExtensions.add(ext));
        }
    }

    // Log unhandled extensions
    const unhandledExtensions = extensions.filter(
        (ext) => !handledExtensions.has(ext),
    );
    if (unhandledExtensions.length > 0) {
        const details = unhandledExtensions.map((ext) => {
            const count = groupedFilesByExtensions.get(ext)?.length ?? 0;
            return `${ext} (${count})`;
        });
        console.warn(`Unhandled extensions found: ${details.join(', ')}`);
    }

    return extractorToFilesMap;
}

async function groupFilesByExtension(
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

export function isGloballyIgnored(file: string): boolean {
    return isIgnored(
        file,
        globallyExcludedDirectories,
        globallyExcludedFilePatterns,
    );
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
