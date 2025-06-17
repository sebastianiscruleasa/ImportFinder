import * as fs from 'fs/promises';
import path from 'path';
import { ImportStatement, LanguageExtractor, Plugin } from '../types';
import { execSync } from 'child_process';
import {
    findProjectPath,
    getLanguageByExtension,
    getRelativePathToRepo,
    isIgnored,
} from './extractors.util';

export const javaPlugin: Plugin = {
    extensions: ['.java'],
    createExtractor,
};

async function createExtractor(
    groupedFilesByExtensions: Map<string, string[]>,
): Promise<LanguageExtractor> {
    const rootPomXmlPaths = findRootPomXmlPathsFromFiles(
        groupedFilesByExtensions.get('.xml') ?? [],
    );
    const [groupIds, importedClassToJarMaps] = await Promise.all([
        findGroupIds(rootPomXmlPaths),
        generateImportedClassToJarMaps(rootPomXmlPaths),
    ]);

    return {
        isIgnored: (file: string) =>
            isIgnored(file, javaExcludedDirectories, javaExcludedFilePatterns),
        async extractImports(filePath: string, repoPath: string) {
            const projectPath = findProjectPath(
                filePath,
                Array.from(importedClassToJarMaps.keys()),
            );

            return await extractImports(
                filePath,
                repoPath,
                projectPath,
                groupIds,
                importedClassToJarMaps.get(projectPath),
            );
        },
    };
}

async function extractImports(
    filePath: string,
    repoPath: string,
    projectPath: string,
    groupIds: string[],
    importedClassToJarMap?: Map<string, ImportedClassMetadata>,
): Promise<ImportStatement[]> {
    if (!importedClassToJarMap) {
        throw new Error(
            `Error finding importedClassToJar map for this project: ${projectPath}`,
        );
    }

    try {
        const relativePath = getRelativePathToRepo(repoPath, filePath);
        const extension = filePath.slice(filePath.lastIndexOf('.'));
        const fileContent = await fs.readFile(filePath, 'utf8');

        const importStatements: ImportStatement[] = [];
        const importRegex = /^\s*import\s+(static\s+)?([\w.]+)(\.\*)?;\s*$/gm;
        let match;
        while ((match = importRegex.exec(fileContent))) {
            const importedClass = match[2];

            if (!isLocalImport(importedClass, groupIds)) {
                const isStatic = match[1] !== undefined;
                const isWildcard = match[3] !== undefined;
                const alias = match[4];
                const { library, importedEntity } = getLibraryAndImportedEntity(
                    importedClass,
                    isStatic,
                    isWildcard,
                    importedClassToJarMap,
                );

                if (isJdkModule(library)) {
                    continue;
                }

                importStatements.push({
                    file: relativePath,
                    projectPath: projectPath,
                    importedEntity: importedEntity,
                    modifiers: [
                        isStatic && 'static',
                        alias && `alias ${alias}`,
                        isWildcard && 'wildcard',
                    ].filter(Boolean) as string[],
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

function getLibraryAndImportedEntity(
    importedClass: string,
    isStatic: boolean,
    isWildcard: boolean,
    packageToJarMap: Map<string, ImportedClassMetadata>,
): { library: string; importedEntity: string } {
    const importDetails = packageToJarMap.get(importedClass);
    if (importDetails) {
        return {
            library: importDetails.jar,
            importedEntity: !isWildcard ? importDetails.entity : '*', // org.junit.jupiter.api.Assertions.* where importedClass is actually everything before *
        };
    } else if (isWildcard) {
        // jakarta.persistence.*, where the imported class from the jdeps output is more like jakarta.persistence.Embeddable
        const match = Array.from(packageToJarMap.entries()).find(([key]) =>
            key.startsWith(importedClass + '.'),
        );

        if (match) {
            const [, importDetails] = match;
            return {
                library: importDetails.jar,
                importedEntity: '*',
            };
        }
    }

    return fallbackForNotFindingJarMatch(importedClass, isWildcard, isStatic);
}

/*
 * This logic is not perfect as it can't find the actual jar, it's more like a guess based on the import statement that can point in the right direction.
 */
function fallbackForNotFindingJarMatch(
    importedClass: string,
    isWildcard: boolean,
    isStatic: boolean,
) {
    if (isWildcard) {
        // Handle wildcard imports (e.g., `static org.junit.jupiter.api.Assertions.*`)
        const lastDotIndex = importedClass.lastIndexOf('.');
        const library = importedClass.slice(0, lastDotIndex);

        const importedEntity = isStatic
            ? importedClass.slice(lastDotIndex + 1) + '.*' // `Assertions.*`
            : '*'; // Regular wildcard

        return { library, importedEntity };
    }

    if (isStatic) {
        // Handle specific static imports (e.g., `org.mockito.Mockito.when`)
        const parts = importedClass.split('.');
        if (parts.length > 2) {
            const library = parts.slice(0, -2).join('.'); // Everything before the last two segments
            const importedEntity = parts.slice(-2).join('.'); // The last two segments (`Mockito.when`)
            return { library, importedEntity };
        }
    }

    // Handle regular imports (e.g., `org.springframework.stereotype.Service`)
    const lastDotIndex = importedClass.lastIndexOf('.');
    if (lastDotIndex !== -1) {
        return {
            library: importedClass.slice(0, lastDotIndex),
            importedEntity: importedClass.slice(lastDotIndex + 1),
        };
    }

    // Unexpected cases
    return { library: '', importedEntity: importedClass };
}

function findRootPomXmlPathsFromFiles(xmlFilePaths: string[]): string[] {
    const pomFiles = xmlFilePaths
        .map((p) => path.normalize(p))
        .filter((p) => path.basename(p) === 'pom.xml');

    const pomDirs = new Set(pomFiles.map((p) => path.dirname(p)));

    const rootPomFiles: string[] = [];

    for (const pomFile of pomFiles) {
        let currentDir = path.dirname(pomFile);
        let isRoot = true;

        while (true) {
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) {
                break; // Reached filesystem root
            }
            if (pomDirs.has(parentDir)) {
                isRoot = false;
                break;
            }
            currentDir = parentDir;
        }

        if (isRoot) {
            rootPomFiles.push(pomFile);
        }
    }

    return rootPomFiles;
}

async function findGroupIds(pomXmlPaths: string[]): Promise<string[]> {
    const groupIds = new Set<string>();

    for (const pomPath of pomXmlPaths) {
        const groupId = await findGroupId(pomPath);
        if (groupId) {
            groupIds.add(groupId);
        }
    }

    return Array.from(groupIds);
}

const groupIdRegex = /<groupId>([\w.]+)<\/groupId>/;

async function findGroupId(pomPath: string): Promise<string | null> {
    try {
        const pomContent = await fs.readFile(pomPath, 'utf8');

        // Remove the <parent>...</parent> block to avoid matching parent groupId like org.springframework.boot
        const cleaned = pomContent.replace(/<parent>[\s\S]*?<\/parent>/, '');

        // Now match the first groupId (which should be the actual project groupId)
        const match = cleaned.match(groupIdRegex);

        if (match && match[1]) {
            return match[1];
        } else {
            console.warn(`No <groupId> found in ${pomPath}`);
        }
    } catch (error) {
        console.error(`Error reading ${pomPath}:`, error);
    }
    return null;
}

type ImportedClassMetadataMapByProject = Map<
    string, // project path
    Map<string, ImportedClassMetadata> // ImportedClass ➝ ImportedClassMetadata
>;

type ImportedClassMetadata = {
    jar: string;
    entity: string;
};

/**
 * Analyzes a set of Maven-based Java projects and generates a mapping of all external class dependencies
 * (imported classes) to the JAR files they originate from.
 *
 * For each provided `pom.xml` path, the method:
 * 1. Identifies the built JAR file in the corresponding `target/` directory.
 * 2. Executes the `jdeps` tool to extract class-level dependencies for that project.
 * 3. Filters out self-references (dependencies to classes from the same JAR).
 * 4. Builds a mapping from each imported class (fully qualified name) to its originating JAR and entity name.
 *
 * Returns a map where each key is a project path, and its value is another map from imported class names
 * to their corresponding JAR and class name (entity).
 */
async function generateImportedClassToJarMaps(
    pomPaths: string[],
): Promise<ImportedClassMetadataMapByProject> {
    const importedClassToJarMapsByProject = new Map<
        string,
        Map<string, ImportedClassMetadata>
    >();

    for (const pomPath of pomPaths) {
        const projectPath = path.dirname(pomPath);
        const [groupId, projectJar] = await Promise.all([
            await findGroupId(pomPath),
            await findProjectJar(projectPath),
        ]);

        if (!projectJar) {
            console.warn(
                `No JAR found in target for ${projectPath}, skipping...`,
            );
            continue;
        }

        let jdepsCombinedOutputs: string;
        try {
            console.info(`Processing ${projectPath}...`);

            const classpath = execSync(
                `cd '${projectPath}' && mvn dependency:build-classpath`,
                { encoding: 'utf-8' },
            ).trim();

            // multi-release was introduced in Java 9
            const javaVersion = getJavaMajorVersion();
            const jdepsCommand = [
                `cd '${projectPath}'`,
                javaVersion >= 9
                    ? `jdeps --multi-release ${javaVersion} -verbose:class -cp "${classpath}" "target/${projectJar}"`
                    : `jdeps -verbose:class -cp "${classpath}" "target/${projectJar}"`,
            ].join(' && ');

            const jdepsOutputs = execSync(jdepsCommand, {
                encoding: 'utf-8',
            }).trim();

            const jdepsTestCommand = [
                `cd '${projectPath}'`,
                javaVersion >= 9
                    ? `jdeps --multi-release ${javaVersion} -verbose:class -cp "${classpath}" "target/test-classes"`
                    : `jdeps -verbose:class -cp "${classpath}" "target/test-classes"`,
            ].join(' && ');
            const jdepsTestOutput = execSync(jdepsTestCommand, {
                encoding: 'utf-8',
            }).trim();
            jdepsCombinedOutputs = jdepsOutputs + '\n' + jdepsTestOutput;
        } catch (error) {
            console.error(
                `Failed to process dependencies for ${projectPath}`,
                error,
            );
            continue;
        }

        console.info(`Parsing jdeps output for ${projectPath}...`);
        const importedClassToJarMap = new Map<string, ImportedClassMetadata>();
        const lines = jdepsCombinedOutputs.trim().split('\n');

        for (const line of lines) {
            const regex = /^\s*(\S+)\s*->\s*(\S+)\s+(\S+?)(?:\.jar)?\s*$/;
            const match = line.match(regex);
            if (match) {
                const sourceClass = match[1];
                const importedClass = match[2];
                const importedJar = match[3];
                if (
                    importedJar === projectJar ||
                    (groupId && !sourceClass.startsWith(groupId))
                ) {
                    // Skip self-references (same JAR) and classes that are not part of the current project.
                    continue;
                }
                const importedEntity = importedClass.split('.').at(-1) || '';

                importedClassToJarMap.set(importedClass, {
                    jar: importedJar
                        .replace(/\.jar$/, '') // remove .jar extension
                        .replace(/-(\d+(?:\.\d+)+.*)$/, '@$1'), // replace last dash before version with @
                    entity: importedEntity,
                });
            }
        }
        importedClassToJarMapsByProject.set(projectPath, importedClassToJarMap);
    }
    return importedClassToJarMapsByProject;
}

export function getJavaMajorVersion(): number {
    // 'java -version' writes to stderr, not stdout
    const versionOutput = execSync('java -version 2>&1', { encoding: 'utf-8' });

    const match = versionOutput.match(/version "(\d+)(?:\.\d+)?(?:\.\d+)?"/);

    if (!match || !match[1]) {
        throw new Error(
            `Unable to parse Java version from output:\n${versionOutput}`,
        );
    }
    return parseInt(match[1], 10);
}

async function findProjectJar(projectPath: string): Promise<string | null> {
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

function isLocalImport(importedClass: string, repoGroupIds: string[]): boolean {
    return repoGroupIds.some((prefix) => importedClass.startsWith(prefix));
}

export function isJdkModule(moduleName: string): boolean {
    return (
        moduleName.startsWith('java.') ||
        moduleName.startsWith('jdk.') ||
        moduleName.startsWith('javax.')
    );
}

const javaExcludedDirectories = ['.gradle', '.mvn'];

const javaExcludedFilePatterns = [
    '*.iml', // IntelliJ IDEA module files

    // Build tools
    'build.gradle',
    'build.gradle.kts',
    'settings.gradle',
    'settings.gradle.kts',
    'pom.xml',
    '*.ivy',
    '*.ivy.xml',

    // Test files (if you're parsing only .java)
    '*Test.java',
    '*.test.java',
    '*.spec.java',
];
