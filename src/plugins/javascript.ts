import * as fs from 'fs/promises';
import { parse } from 'jsonc-parser';
import * as babelParser from '@babel/parser';
import traverse from '@babel/traverse';
import { ImportStatement, LanguageExtractor, Plugin } from '../types';
import {
    findProjectPath,
    getLanguageByExtension,
    getRelativePathToRepo,
    isIgnored,
} from './plugin.util';
import path from 'path';
import {
    buildDepTreeFromFiles,
    getNpmLockfileVersion,
    NodeLockfileVersion,
    parseNpmLockV2Project,
} from 'snyk-nodejs-lockfile-parser';

export const javaScriptPlugin: Plugin = {
    extensions: ['.js', '.ts', '.jsx', '.tsx'],
    createExtractor,
};

async function createExtractor(
    groupedFilesByExtensions: Map<string, string[]>,
): Promise<LanguageExtractor> {
    const jsonFiles = groupedFilesByExtensions.get('.json') ?? [];
    const jsOrTsConfigs = jsonFiles.filter(
        (file) =>
            file.endsWith('tsconfig.json') || file.endsWith('jsconfig.json'),
    );
    const localAbsoluteImportPrefixes =
        await extractLocalAbsoluteImportPrefixes(jsOrTsConfigs);

    const packageJsonFiles = jsonFiles.filter((file) =>
        file.endsWith('package.json'),
    );
    const packageLockJsonFiles = jsonFiles.filter((file) =>
        file.endsWith('package-lock.json'),
    );

    const dependencyMap = await buildDependencyMap(
        packageJsonFiles,
        packageLockJsonFiles,
    );

    return {
        isIgnored: (file: string) =>
            isIgnored(
                file,
                javascriptExcludedDirectories,
                javascriptExcludedFilePatterns,
            ),
        async extractImports(filePath: string, repoPath: string) {
            const projectPath = findProjectPath(
                filePath,
                Array.from(dependencyMap.keys()),
            );

            return await extractImports(
                filePath,
                repoPath,
                projectPath,
                localAbsoluteImportPrefixes,
                dependencyMap.get(projectPath),
            );
        },
    };
}

async function extractImports(
    filePath: string,
    repoPath: string,
    projectPath: string,
    localAbsoluteImportPrefixes: Set<string>,
    dependencyMap?: Map<string, string>,
): Promise<ImportStatement[]> {
    if (!dependencyMap) {
        throw new Error(
            `Error finding dependency map for this project: ${projectPath}`,
        );
    }

    try {
        const relativePath = getRelativePathToRepo(repoPath, filePath);
        const extension = filePath.slice(filePath.lastIndexOf('.'));
        const fileContent = await fs.readFile(filePath, 'utf8');

        // Parse the content
        const ast = babelParser.parse(fileContent, {
            sourceType: 'module',
            plugins: [
                'jsx', // Handles JSX syntax
                'typescript', // Handles TypeScript syntax
                'decorators-legacy', // Handles decorators if used
                'classProperties', // Handles class properties
                'optionalChaining', // Handles optional chaining
                'nullishCoalescingOperator', // Handles ?? operator
            ],
        });

        const importStatements: ImportStatement[] = [];
        traverse(ast, {
            // Check for import statements commonly used in E6+ modules like:
            // - import something from 'some-library';
            // - import { somethingElse } from 'another-library';
            ImportDeclaration({ node }) {
                if (
                    node.source &&
                    node.source.type === 'StringLiteral' &&
                    !isLocalImport(
                        node.source.value,
                        localAbsoluteImportPrefixes,
                    ) &&
                    !isNodeModule(node.source.value)
                ) {
                    const library =
                        dependencyMap.get(node.source.value) ??
                        fallbackResolveImport(node.source.value, dependencyMap);
                    const fullImport =
                        typeof node.start === 'number' &&
                        typeof node.end === 'number'
                            ? fileContent.slice(node.start, node.end)
                            : `import ... from '${library}'`;
                    const importedEntities = node.specifiers
                        .map((specifier) => {
                            if (specifier.type === 'ImportDefaultSpecifier') {
                                return {
                                    name: specifier.local.name,
                                    modifier: null,
                                }; // Default imports
                            }
                            if (specifier.type === 'ImportSpecifier') {
                                const importedName =
                                    specifier.imported.type === 'Identifier'
                                        ? specifier.imported.name // Use `name` if it's an Identifier
                                        : specifier.imported.value; // Use `value` if it's a StringLiteral
                                const hasAlias =
                                    importedName !== specifier.local.name;
                                return {
                                    name: specifier.local.name,
                                    modifier: hasAlias ? 'alias' : null,
                                }; // Named imports with or without alias
                            }
                            if (specifier.type === 'ImportNamespaceSpecifier') {
                                return {
                                    name: `* as ${specifier.local.name}`,
                                    modifier: 'wildcard, alias',
                                }; // Namespace imports
                            }
                        })
                        .filter((entity) => entity != undefined);

                    // Extract modifiers
                    const modifiers = importedEntities
                        .map((entity) => entity.modifier)
                        .filter((modifier) => modifier !== null); // Filter out nulls

                    importStatements.push({
                        file: relativePath,
                        projectPath: projectPath,
                        importedEntity: importedEntities
                            .filter(Boolean)
                            .map((entity) => entity!.name)
                            .join(', '), // Concatenate all valid imported entities
                        modifiers: modifiers,
                        language: getLanguageByExtension(extension),
                        library: library,
                        fullImport: fullImport,
                    });
                }
            },
            // Check for require statements commonly used in CommonJS modules like:
            // - const something = require('some-library');
            CallExpression({ node }) {
                if (
                    node.callee?.type === 'Identifier' &&
                    node.callee.name === 'require' &&
                    node.arguments?.length > 0 &&
                    node.arguments[0].type === 'StringLiteral' &&
                    !isLocalImport(
                        node.arguments[0].value,
                        localAbsoluteImportPrefixes,
                    ) &&
                    !isNodeModule(node.arguments[0].value)
                ) {
                    const library =
                        dependencyMap.get(node.arguments[0].value) ??
                        fallbackResolveImport(
                            node.arguments[0].value,
                            dependencyMap,
                        );
                    const fullImport =
                        typeof node.start === 'number' &&
                        typeof node.end === 'number'
                            ? fileContent.slice(node.start, node.end)
                            : `const ... = require('${library}');`;
                    importStatements.push({
                        file: relativePath,
                        projectPath: projectPath,
                        importedEntity: '', // No `importedEntity` for require
                        modifiers: [], // No modifiers for require
                        language: getLanguageByExtension(extension),
                        library: library,
                        fullImport: fullImport,
                    });
                }
            },
            // This handles dynamic import() calls, often used for code-splitting:
            // - const something = await import('some-library');
            ImportExpression({ node }) {
                if (
                    node.source &&
                    node.source.type === 'StringLiteral' &&
                    !isLocalImport(
                        node.source.value,
                        localAbsoluteImportPrefixes,
                    ) &&
                    !isNodeModule(node.source.value)
                ) {
                    const library =
                        dependencyMap.get(node.source.value) ??
                        fallbackResolveImport(node.source.value, dependencyMap);
                    const fullImport =
                        typeof node.start === 'number' &&
                        typeof node.end === 'number'
                            ? fileContent.slice(node.start, node.end)
                            : `import('${library}');`;
                    importStatements.push({
                        file: relativePath,
                        projectPath: projectPath,
                        importedEntity: '', // No `importedEntity` for dynamic imports
                        modifiers: [], // No modifiers for dynamic imports
                        language: getLanguageByExtension(extension),
                        library: library,
                        fullImport: fullImport,
                    });
                }
            },
        });

        return importStatements;
    } catch (error) {
        console.error(`Failed to process file: ${filePath}`);
        if (error instanceof Error) {
            console.error(`Error: ${error.message}`);
        } else {
            console.error(`Unknown error: ${error}`);
        }
        return [];
    }
}

interface TsConfig {
    compilerOptions?: {
        baseUrl?: string;
        paths?: Record<string, string[]>;
    };
}

async function extractLocalAbsoluteImportPrefixes(
    configPaths: string[],
): Promise<Set<string>> {
    const allPrefixes: Set<string> = new Set();

    for (const configPath of configPaths) {
        try {
            const raw = await fs.readFile(configPath, 'utf8');
            const parsed: TsConfig = parse(raw);
            const baseUrl = parsed.compilerOptions?.baseUrl;
            const paths = parsed.compilerOptions?.paths;

            if (paths) {
                for (const key of Object.keys(paths)) {
                    const cleaned = key.replace(/\/\*$/, '');
                    allPrefixes.add(cleaned);
                }
            } else if (baseUrl) {
                const relativeBase = baseUrl
                    .replace(/^\.\/?/, '')
                    .replace(/\/$/, '');
                if (relativeBase.length > 0) {
                    allPrefixes.add(relativeBase);
                }
            }
        } catch (err) {
            console.error(`Failed to parse js/tsconfig: ${configPath}`, err);
        }
    }

    return allPrefixes;
}

type DependencyMap = Map<string, Map<string, string>>;

/**
 * Builds a map of project path => { library: library@version } from valid package.json and package-lock files.
 */
export async function buildDependencyMap(
    packageJsonPaths: string[],
    packageLockJsonPaths: string[],
): Promise<DependencyMap> {
    const depMap: DependencyMap = new Map();

    const packageGroups = groupPackageJsonAndLockFiles(
        packageJsonPaths,
        packageLockJsonPaths,
    );

    for (const { packageJsonPath, packageLockPath } of packageGroups) {
        const packageLockContent = await fs.readFile(packageLockPath, 'utf8');
        const lockFileVersion = getNpmLockfileVersion(packageLockContent);
        if (lockFileVersion === NodeLockfileVersion.NpmLockV1) {
            // npm v1 lock files are only handled in this buildDepTreeFromFiles method, but they are considered deprecated
            const root = path.dirname(packageJsonPath);
            const depTree = await buildDepTreeFromFiles(
                root,
                'package.json',
                'package-lock.json',
                true,
                false,
            );

            if (depTree.dependencies) {
                const depEntries = new Map<string, string>();

                for (const [libraryName, dep] of Object.entries(
                    depTree.dependencies,
                )) {
                    const libraryVersion = dep.version;
                    depEntries.set(
                        libraryName,
                        `${libraryName}@${libraryVersion}`,
                    );
                }

                const projectDir = path.dirname(packageJsonPath);
                depMap.set(projectDir, depEntries);
            }
        } else {
            const packageJsonContent = await fs.readFile(
                packageJsonPath,
                'utf8',
            );

            const depGraph = await parseNpmLockV2Project(
                packageJsonContent,
                packageLockContent,
                {
                    includeDevDeps: true,
                    strictOutOfSync: false,
                    includeOptionalDeps: false,
                    pruneCycles: true,
                    includePeerDeps: false,
                    pruneNpmStrictOutOfSync: false,
                },
            );

            const deps = depGraph.getDepPkgs();
            const depEntries = new Map<string, string>();
            for (const dep of deps) {
                depEntries.set(dep.name, `${dep.name}@${dep.version}`);
            }

            const projectDir = path.dirname(packageJsonPath);
            depMap.set(projectDir, depEntries);
        }
    }

    return depMap;
}

type PackageGroup = {
    packageJsonPath: string;
    packageLockPath: string;
};

/**
 * Groups package.json and package-lock.json files based on their directory.
 * Only returns pairs where both files exist in the same folder.
 */
function groupPackageJsonAndLockFiles(
    packageJsonPaths: string[],
    packageLockPaths: string[],
): PackageGroup[] {
    const lockMap = new Map<string, string>(); // key: directory, value: package-lock.json path
    const grouped: PackageGroup[] = [];

    // Index all package-lock.json paths by their parent directory
    for (const lockPath of packageLockPaths) {
        const dir = path.dirname(lockPath);
        lockMap.set(dir, lockPath);
    }

    // Match each package.json to a lock file in the same directory
    for (const jsonPath of packageJsonPaths) {
        const dir = path.dirname(jsonPath);
        const lockPath = lockMap.get(dir);

        if (lockPath) {
            grouped.push({
                packageJsonPath: jsonPath,
                packageLockPath: lockPath,
            });
        }
    }

    return grouped;
}

/**
 * Handles import sub-paths (e.g., 'swr/immutable', 'lodash/fp') by trying to
 * resolve them to their root package (e.g., 'swr', 'lodash') from the list of
 * known depinder dependencies.
 */
function fallbackResolveImport(
    libraryName: string,
    dependencyMap: Map<string, string>,
): string {
    const importPath = libraryName;
    const installedLibs = new Set(dependencyMap.keys());

    const parts = importPath.split('/');
    const candidates = [];

    // Scoped packages (@scope/package)
    if (importPath.startsWith('@') && parts.length >= 2) {
        candidates.push(`${parts[0]}/${parts[1]}`);
    }

    // All shorter prefixes (e.g. lodash/fp → lodash)
    for (let i = 1; i <= parts.length; i++) {
        candidates.push(parts.slice(0, i).join('/'));
    }

    // Match longest valid package
    for (const candidate of candidates.sort((a, b) => b.length - a.length)) {
        if (installedLibs.has(candidate)) {
            return dependencyMap.get(candidate)!;
        }
    }

    return 'No match found in lock file'; // no match
}

function isLocalImport(
    importPath: string,
    localAbsoluteImportPrefixes: Set<string>,
): boolean {
    return (
        importPath.startsWith('./') ||
        importPath.startsWith('../') ||
        importPath.startsWith('/') ||
        isLocalAbsoluteImport(importPath, localAbsoluteImportPrefixes)
    );
}

function isLocalAbsoluteImport(
    importPath: string,
    localAbsoluteImportPrefixes: Set<string>,
): boolean {
    for (const prefix of localAbsoluteImportPrefixes) {
        if (importPath === prefix || importPath.startsWith(`${prefix}/`)) {
            return true;
        }
    }
    return false;
}

export function isNodeModule(importPath: string): boolean {
    // Strip 'node:' prefix if present (ESM style)
    const normalized = importPath.startsWith('node:')
        ? importPath.slice(5)
        : importPath;

    return nodeModules.has(normalized);
}

const nodeModules = new Set([
    'assert',
    'async_hooks',
    'buffer',
    'child_process',
    'cluster',
    'console',
    'constants',
    'crypto',
    'dgram',
    'dns',
    'domain',
    'events',
    'fs',
    'fs/promises',
    'http',
    'http2',
    'https',
    'inspector',
    'module',
    'net',
    'os',
    'path',
    'perf_hooks',
    'process',
    'punycode',
    'querystring',
    'readline',
    'repl',
    'stream',
    'string_decoder',
    'timers',
    'tls',
    'trace_events',
    'tty',
    'url',
    'util',
    'v8',
    'vm',
    'worker_threads',
    'zlib',
]);

const javascriptExcludedDirectories = [
    '.nuxt',
    '.svelte-kit',
    '.storybook',
    '.vercel',
    '.firebase',
    'storybook-static',
    '.cache',
    '.output',
    '.vite',
    '.angular',
    '.astro',
];

const javascriptExcludedFilePatterns = [
    '*.test.js',
    '*.test.ts',
    '*.test.jsx',
    '*.test.tsx',
    '*.spec.js',
    '*.spec.ts',
    '*.spec.jsx',
    '*.spec.tsx',
    '*.d.ts',
    '*.min.js',
    'webpack.config.js',
    'babel.config.js',
    'tsconfig.json',
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.prettierrc.js',
    'jest.config.js',
];
