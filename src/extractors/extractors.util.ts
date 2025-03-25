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
