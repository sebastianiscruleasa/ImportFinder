import * as fs from 'fs-extra';

export async function extractLibrariesFromJavastackFile(
    filePath: string,
    localPrefixes: string[],
): Promise<string[]> {
    try {
        // Read the file content
        const code = await fs.readFile(filePath, 'utf8');

        // Regex to match import statements
        const importRegex = /^\s*import\s+(static\s+)?([\w.]+)(\.\*)?;\s*$/gm;

        const librarySet = new Set<string>();
        let match;

        // Apply the regex to find all import statements
        while ((match = importRegex.exec(code)) !== null) {
            const importPath = match[2]; // Capture group for the import path
            if (!isLocalJavastackImport(importPath, localPrefixes)) {
                librarySet.add(importPath);
            }
        }

        return Array.from(librarySet);
    } catch (error) {
        console.error(`Failed to process file: ${filePath}`);
        if (error instanceof Error) {
            console.error(`Error: ${error.message}`);
        }
        return [];
    }
}

// Function to dynamically infer local prefixes (e.g., from pom.xml)
export async function inferJavaLocalPrefixes(
    repoPath: string,
): Promise<string[]> {
    const groupIdRegex = /<groupId>([\w.]+)<\/groupId>/;
    const pomPath = `${repoPath}/pom.xml`;

    if (await fs.pathExists(pomPath)) {
        const pomContent = await fs.readFile(pomPath, 'utf8');
        const match = pomContent.match(groupIdRegex);
        if (match) {
            return [match[1]]; // Return the groupId as the prefix
        }
    }

    return []; // Fallback to no prefixes if not found
}

// Function to determine if an import is local
function isLocalJavastackImport(
    importPath: string,
    localPrefixes: string[],
): boolean {
    return localPrefixes.some((prefix) => importPath.startsWith(prefix));
}

export const javastackExtensions = ['.java', '.kt', '.groovy', '.scala'];
