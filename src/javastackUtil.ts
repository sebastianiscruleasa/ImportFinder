import * as fs from 'fs-extra';
import path from 'path';
import { ImportStatement } from './types';
import { getLanguageByExtension, removeRepoPath } from './util';
import { execSync } from 'child_process';

export async function extractImportsFromJavastackFile(
    filePath: string,
    repoPath: string,
    groupIds: string[],
    packageToJarMap?: Map<string, ImportToJarMapping>,
): Promise<ImportStatement[]> {
    try {
        const relativePath = removeRepoPath(repoPath, filePath);

        const extension = filePath.slice(filePath.lastIndexOf('.'));
        // Read the file content
        const code = await fs.readFile(filePath, 'utf8');

        // Regex to match import statements
        const importRegex = /^\s*import\s+(static\s+)?([\w.]+)(\.\*)?;\s*$/gm;

        const importStatements: ImportStatement[] = [];
        let match;

        // Apply the regex to find all import statements
        while ((match = importRegex.exec(code)) !== null) {
            const importStatement = match[2];

            if (!isLocalJavastackImport(importStatement, groupIds)) {
                const isStatic = match[1] !== undefined;
                const isWildcard = match[3] !== undefined;
                const alias = match[4];
                const { library, importedEntity } =
                    getLibraryAndImportedEntities(
                        importStatement,
                        isStatic,
                        isWildcard,
                        packageToJarMap,
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

export function getLibraryAndImportedEntities(
    importStatement: string,
    isStatic: boolean,
    isWildcard: boolean,
    packageToJarMap?: Map<string, ImportToJarMapping>,
): { library: string; importedEntity: string } {
    // // Find the correct packageToJarMap by checking which root has a matching package
    if (packageToJarMap) {
        for (const [key, importDetails] of packageToJarMap.entries()) {
            if (importStatement.startsWith(key)) {
                return {
                    library: importDetails.jar,
                    importedEntity: importDetails.entity,
                };
            }
        }
    }

    // Fallback logic for when packageToJarMap is not provided
    if (isWildcard) {
        // Handle wildcard imports (e.g., `static org.junit.jupiter.api.Assertions.*`)
        const lastDotIndex = importStatement.lastIndexOf('.');
        const library =
            isStatic && lastDotIndex !== -1
                ? importStatement.slice(0, lastDotIndex) // Everything before `Assertions`
                : importStatement.slice(0, lastDotIndex); // For regular wildcard imports

        const importedEntity = isStatic
            ? importStatement.slice(lastDotIndex + 1) + '.*' // Append `.*` for static wildcard imports
            : '*'; // Regular wildcard

        return { library, importedEntity };
    }

    if (isStatic) {
        // Handle specific static imports (e.g., `org.mockito.Mockito.when`)
        const parts = importStatement.split('.');
        if (parts.length > 2) {
            const library = parts.slice(0, -2).join('.'); // Everything before the last two segments
            const importedEntity = parts.slice(-2).join('.'); // The last two segments (`Mockito.when`)
            return { library, importedEntity };
        }
    }

    // Handle regular imports (e.g., `org.springframework.stereotype.Service`)
    const lastDotIndex = importStatement.lastIndexOf('.');
    if (lastDotIndex !== -1) {
        return {
            library: importStatement.slice(0, lastDotIndex),
            importedEntity: importStatement.slice(lastDotIndex + 1),
        };
    }

    // Fallback for unexpected cases
    return { library: '', importedEntity: importStatement };
}

interface ImportToJarMapping {
    jar: string;
    entity: string;
}

export async function generatePackageToJarMaps(
    pomPaths: string[],
): Promise<Map<string, Map<string, ImportToJarMapping>>> {
    const projectImportToJarMap = new Map<
        string,
        Map<string, ImportToJarMapping>
    >();

    for (const pomPath of pomPaths) {
        const projectPath = path.dirname(pomPath); // Get project root directory
        const jarFileName = await findBuiltJarName(projectPath); // Find the JAR filename

        if (!jarFileName) {
            console.warn(
                `No JAR found in target for ${projectPath}, skipping...`,
            );
            continue;
        }

        let jdepsOutput: string;
        try {
            console.info(`Processing ${projectPath}...`);

            // Get the classpath from Maven
            const classpath = execSync(
                `cd '${projectPath}' && mvn dependency:build-classpath`,
                { encoding: 'utf-8' },
            ).trim();

            // Run jdeps to analyze dependencies
            jdepsOutput = execSync(
                `cd '${projectPath}' && jdeps --multi-release 17 -verbose:class -cp "${classpath}" target/${jarFileName}`,
                { encoding: 'utf-8' },
            ).trim();
            // console.log(jdepsOutput);
        } catch (error) {
            console.error(
                `Failed to process dependencies for ${projectPath}`,
                error,
            );
            continue;
        }

        // Parse jdeps output
        console.info(`Parsing jdeps output for ${projectPath}...`);
        const importToJarMap = new Map<string, ImportToJarMapping>();
        const lines = jdepsOutput.trim().split('\n');

        for (const line of lines) {
            // const match = line.match(/\S+ -> (\S+)\s+(\S+\.jar)/);
            // const match = line.match(/\S+ -> (\S+)\s+(\S+)/);
            const regex = /\S+ -> (\S+)\s+(\S+)/;
            // const regex = /^\s*(\S+)\s*->\s*(\S+)\s*(\S+)$/;
            // const regex = /^\s*(\S+)\s*->\s*(\S+(?:\.\S+)*?)\s+(\S+(\.jar)?)$/;

            const match = line.match(regex);
            if (match) {
                const [, fullImport, jarFile] = match;
                if (jarFile === jarFileName) {
                    // Skip self-references
                    continue;
                }
                const parts = fullImport.split('.');
                const entity = parts.pop() || '';
                const packageName = parts.join('.');

                importToJarMap.set(fullImport, {
                    jar: jarFile.replace(/\.jar$/, ''),
                    entity,
                });
            }
        }

        projectImportToJarMap.set(projectPath, importToJarMap);
    }
    console.log(projectImportToJarMap);
    return projectImportToJarMap;
}

// Helper function to find the built JAR in the target directory
async function findBuiltJarName(projectPath: string): Promise<string | null> {
    try {
        const files = execSync(`ls '${projectPath}/target'`, {
            encoding: 'utf-8',
        })
            .split('\n')
            .map((file) => file.trim())
            .filter(
                (file) =>
                    file.endsWith('.jar') &&
                    !file.includes('-sources') &&
                    !file.includes('-javadoc'),
            );

        return files.length > 0 ? files[0] : null;
    } catch (error) {
        console.error(`Failed to find JAR in ${projectPath}/target`, error);
        return null;
    }
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

export function findProjectPath(
    filePath: string,
    projectPaths: string[],
): string | null {
    let bestMatch: string | null = null;

    for (const projectPath of projectPaths) {
        if (filePath.startsWith(projectPath)) {
            if (!bestMatch || projectPath.length > bestMatch.length) {
                bestMatch = projectPath;
            }
        }
    }

    return bestMatch; // Can be null if no match is found, then we will use some fallback logic
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
