import * as fs from 'fs-extra';
import * as babelParser from '@babel/parser';
import traverse from '@babel/traverse';
import { isStringLiteral } from './util';

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
): Promise<string[]> {
    try {
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

        const librarySet = new Set<string>();
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
                    librarySet.add(node.source.value);
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
                    librarySet.add(node.arguments[0].value);
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
                    librarySet.add(node.source.value);
                }
            },
        });

        return Array.from(librarySet);
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
