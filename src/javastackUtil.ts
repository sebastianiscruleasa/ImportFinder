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
