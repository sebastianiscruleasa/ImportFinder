import path from 'path';

export function getRelativePathToRepo(
    repoPath: string,
    filePath: string,
): string {
    if (filePath.startsWith(repoPath)) {
        return filePath.replace(repoPath, '').replace(/^\//, ''); // Remove repoPath and leading slash
    }
    return filePath; // If the filePath doesn't start with repoPath, return as is
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

export function getLanguageByExtension(extension: string): string {
    return extensionToLanguage[extension] || 'Unknown';
}

const extensionToLanguage: Record<string, string> = {
    '.java': 'Java',
    '.js': 'JavaScript',
    '.ts': 'TypeScript',
    '.jsx': 'JavaScript (JSX)',
    '.tsx': 'TypeScript (TSX)',
};

export function findProjectPath(
    filePath: string,
    projectPaths: string[],
): string {
    let bestMatch: string = '';

    for (const projectPath of projectPaths) {
        if (filePath.startsWith(projectPath)) {
            if (!bestMatch || projectPath.length > bestMatch.length) {
                bestMatch = projectPath;
            }
        }
    }

    return bestMatch;
}
