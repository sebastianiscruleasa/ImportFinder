import * as fs from 'fs-extra';
import * as babelParser from '@babel/parser';
import traverse from '@babel/traverse';
import { getLanguageByExtension, isStringLiteral } from './util';
import { ImportStatement } from './types';

/**
 * Determine if an import path is local
 * @param importPath The import path to check
 * @returns True if the import path is local, false otherwise
 */
export function isLocalImportJavascript(importPath: string): boolean {
    // Returns true for local imports, false for external imports
    return (
        importPath.startsWith('./') ||
        importPath.startsWith('../') ||
        importPath.startsWith('/')
    );
}

export async function extractImportsFromJavascriptTypescriptFile(
    filePath: string,
    relativePath: string,
): Promise<ImportStatement[]> {
    try {
        const extension = filePath.slice(filePath.lastIndexOf('.'));
        // Read file content
        const code = await fs.readFile(filePath, 'utf8');

        // Parse the content
        const ast = babelParser.parse(code, {
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
            // Check for import statements commonly used in E6+ modules
            // import something from 'some-library';
            // import { somethingElse } from 'another-library';
            ImportDeclaration({ node }) {
                if (
                    node.source &&
                    isStringLiteral(node.source) &&
                    !isLocalImportJavascript(node.source.value)
                ) {
                    const library = node.source.value;
                    const fullImport =
                        typeof node.start === 'number' &&
                        typeof node.end === 'number'
                            ? code.slice(node.start, node.end)
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
                                    modifier: 'wildcard',
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
                        importedEntity: importedEntities
                            .filter(Boolean)
                            .map((entity) => entity!.name)
                            .join(', '), // Concatenate all valid imported entities
                        modifiers: modifiers.length > 0 ? modifiers : [],
                        language: getLanguageByExtension(extension),
                        library: library,
                        fullImport: fullImport,
                    });
                }
            },
            // Check for require statements commonly used in CommonJS modules
            //const something = require('some-library');
            CallExpression({ node }) {
                if (
                    node.callee?.type === 'Identifier' &&
                    node.callee.name === 'require' &&
                    node.arguments?.length > 0 &&
                    isStringLiteral(node.arguments[0]) &&
                    !isLocalImportJavascript(node.arguments[0].value)
                ) {
                    const library = node.arguments[0].value;
                    const fullImport =
                        typeof node.start === 'number' &&
                        typeof node.end === 'number'
                            ? code.slice(node.start, node.end)
                            : `const ... = require('${library}');`;
                    importStatements.push({
                        file: relativePath,
                        importedEntity: '', // No `importedEntity` for require
                        modifiers: [], // No modifiers for require
                        language: getLanguageByExtension(extension),
                        library: library,
                        fullImport: fullImport,
                    });
                }
            },
            // This handles dynamic import() calls, often used for code-splitting
            // const something = await import('some-library');
            ImportExpression({ node }) {
                if (
                    node.source &&
                    isStringLiteral(node.source) &&
                    !isLocalImportJavascript(node.source.value)
                ) {
                    const library = node.source.value;
                    const fullImport =
                        typeof node.start === 'number' &&
                        typeof node.end === 'number'
                            ? code.slice(node.start, node.end)
                            : `import('${library}');`;
                    importStatements.push({
                        file: relativePath,
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
        // Log error with the file name
        console.error(`Failed to process file: ${filePath}`);
        if (error instanceof Error) {
            console.error(`Error: ${error.message}`);
        } else {
            console.error(`Unknown error: ${error}`);
        }
        return [];
    }
}

export const javascriptExtensions = ['.js', '.ts', '.jsx', '.tsx'];

export const javascriptIgnoreList = [
    // folders
    'node_modules',
    'dist',
    'build',
    'out',
    'target',
    'coverage',
    '.nyc_output',
    '.git',
    '.cache',
    '.next',
    '.nuxt',
    'public',
    'static',
    'assets',
    //files
    '*.min.js',
    '*.d.ts',
    '*.test.js',
    '*.test.ts',
    '*.spec.js',
    '*.spec.ts',
    '*.tmp',
    '*.bak',
    'webpack.config.js',
    'babel.config.js',
    'tsconfig.json',
    '.eslintrc.js',
    '.prettierrc.js',
    'jest.config.js',
];
