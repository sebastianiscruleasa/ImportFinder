import * as fs from 'fs-extra';
import path from 'path';
import { ImportStatement } from './types';
import { getLanguageByExtension } from './util';

export async function extractImportsFromJavastackFile(
    filePath: string,
    relativePath: string,
    groupIds: string[],
): Promise<ImportStatement[]> {
    try {
        const extension = filePath.slice(filePath.lastIndexOf('.'));
        // Read the file content
        const code = await fs.readFile(filePath, 'utf8');

        // Regex to match import statements
        const importRegex = /^\s*import\s+(static\s+)?([\w.]+)(\.\*)?;\s*$/gm;

        const importStatements: ImportStatement[] = [];
        let match;

        // Apply the regex to find all import statements
        while ((match = importRegex.exec(code)) !== null) {
            const importPath = match[2];

            if (!isLocalJavastackImport(importPath, groupIds)) {
                const isStatic = match[1] !== undefined;
                const isWildcard = match[3] !== undefined;
                const alias = match[4];
                const { library, importedEntity } = parseImportPathUsingCapital(
                    importPath,
                    isStatic,
                    isWildcard,
                );

                importStatements.push({
                    file: relativePath,
                    importedEntity: importedEntity,
                    modifiers: [
                        ...(isStatic ? ['static'] : []),
                        ...(alias ? [`alias ${alias}`] : []),
                        ...(isWildcard ? ['wildcard'] : []), // Add `wildcard` if it's a `.*` import
                    ],
                    language: getLanguageByExtension(extension),
                    library: library,
                    fullImport: match[0].trim(),
                });
            }
        }

        return importStatements;
    } catch (error) {
        console.error(`Failed to process file: ${filePath}`);
        if (error instanceof Error) {
            console.error(`Error: ${error.message}`);
        }
        return [];
    }
}

export function parseImportPathUsingCapital(
    importPath: string,
    isStatic: boolean,
    isWildcard: boolean,
): { library: string; importedEntity: string } {
    if (isWildcard) {
        // Handle wildcard imports (e.g., `static org.junit.jupiter.api.Assertions.*`)
        const lastDotIndex = importPath.lastIndexOf('.');
        const library =
            isStatic && lastDotIndex !== -1
                ? importPath.slice(0, lastDotIndex) // Everything before `Assertions`
                : importPath.slice(0, lastDotIndex); // For regular wildcard imports

        const importedEntity = isStatic
            ? importPath.slice(lastDotIndex + 1) + '.*' // Append `.*` for static wildcard imports
            : '*'; // Regular wildcard

        return { library, importedEntity };
    }

    if (isStatic) {
        // Handle specific static imports (e.g., `org.mockito.Mockito.when`)
        const parts = importPath.split('.');
        if (parts.length > 2) {
            const library = parts.slice(0, -2).join('.'); // Everything before the last two segments
            const importedEntity = parts.slice(-2).join('.'); // The last two segments (`Mockito.when`)
            return { library, importedEntity };
        }
    }

    // Handle regular imports (e.g., `org.springframework.stereotype.Service`)
    const lastDotIndex = importPath.lastIndexOf('.');
    if (lastDotIndex !== -1) {
        return {
            library: importPath.slice(0, lastDotIndex),
            importedEntity: importPath.slice(lastDotIndex + 1),
        };
    }

    // Fallback for unexpected cases
    return { library: '', importedEntity: importPath };
}

export async function findRootPomXmlPaths(repoPath: string): Promise<string[]> {
    const queue: string[] = [repoPath];
    const pomPaths: Set<string> = new Set();
    const visitedRoots: Set<string> = new Set(); // Track processed root directories

    while (queue.length > 0) {
        const currentDir = queue.shift()!;
        const entries = await fs.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);

            if (entry.isFile() && entry.name === 'pom.xml') {
                const rootDir = path.dirname(fullPath);

                // Avoid processing submodules by ensuring we only collect one pom.xml per root directory
                if (!visitedRoots.has(rootDir)) {
                    visitedRoots.add(rootDir); // Mark directory as processed
                    pomPaths.add(fullPath); // Store the root pom.xml path
                }
            } else if (entry.isDirectory()) {
                queue.push(fullPath);
            }
        }
    }

    return Array.from(pomPaths);
}

export async function extractGroupIdsFromPoms(
    pomXmlPaths: string[],
): Promise<string[]> {
    const groupIdRegex = /<groupId>([\w.]+)<\/groupId>/;
    const groupIds: Set<string> = new Set();

    for (const pomPath of pomXmlPaths) {
        try {
            const pomContent = await fs.readFile(pomPath, 'utf8');
            const match = pomContent.match(groupIdRegex);
            if (match) {
                groupIds.add(match[1]); // Store unique groupIds
            } else {
                console.warn(`No <groupId> found in ${pomPath}`);
            }
        } catch (error) {
            console.error(`Error reading ${pomPath}:`, error);
        }
    }

    return Array.from(groupIds);
}

// Function to determine if an import is local
function isLocalJavastackImport(
    importPath: string,
    localPrefixes: string[],
): boolean {
    return localPrefixes.some((prefix) => importPath.startsWith(prefix));
}

export const javastackExtensions = ['.java', '.kt', '.groovy', '.scala'];

export const javastackIgnoreList = [
    // Build and output directories
    'target', // Maven
    'build', // Gradle
    'out', // IntelliJ/Eclipse

    // IDE metadata and configurations
    '.classpath',
    '.project', // Eclipse
    '.idea', // IntelliJ IDEA
    '.vscode', // VS Code
    '.settings', // Eclipse

    // Version control metadata
    '.git',
    '.svn',

    // Test files and directories
    'src/test', // Common test directory for all languages
    '*.test.java',
    '*.test.kt',
    '*.test.scala',
    '*.test.groovy',
    '*.spec.java',
    '*.spec.kt',
    '*.spec.scala',
    '*.spec.groovy',
    'jacoco', // Code coverage
    '.nyc_output', // Code coverage

    // Binary files and libraries
    '*.class', // Compiled Java/Kotlin/Scala/Groovy files
    '*.jar', // Java archives
    '*.war', // Web application archives
    '*.ear', // Enterprise application archives
    '*.kts', // Kotlin scripts

    // Logs and temporary files
    '*.log',
    '*.tmp',
    '*.bak',
    '*.swp',

    // Documentation and resources
    'docs',
    '*.md',
    '*.png',
    '*.jpg',
    '*.svg',
    '*.sql',

    // Libraries and dependencies
    'lib',
    'libs',
    'node_modules',
    '*.zip',
    '*.tar.gz',

    // Gradle and Maven specific files
    '*.iml', // IntelliJ IDEA module files
    'build.gradle',
    'build.gradle.kts', // Gradle build scripts
    'settings.gradle',
    'settings.gradle.kts', // Gradle settings
    'pom.xml', // Maven build configuration
    '*.ivy',
    '*.ivy.xml', // Ivy build files
    '*.sbt', // SBT build files (Scala)

    // Scala and Groovy specific
    '.metals', // Scala Metals IDE files
    '.bloop', // Scala build tools
    'groovyc', // Groovy compiled outputs
];
