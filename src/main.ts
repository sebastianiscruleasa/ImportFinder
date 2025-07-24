import { saveImportsToJsonFile } from './util';
import { ImportStatement } from './types';
import { groupFilesByExtractor } from './plugins/extractorDispatcher';

async function extractImports(repoPath: string): Promise<ImportStatement[]> {
    console.time('extractImports');

    const importStatements: ImportStatement[] = [];
    const groupedFiles = await groupFilesByExtractor(repoPath);

    for (const [extractor, files] of groupedFiles.entries()) {
        for (const file of files) {
            if (extractor.isIgnored(file)) {
                continue;
            }
            const imports = await extractor.extractImports(file, repoPath);
            importStatements.push(...imports);
        }
    }

    console.timeEnd('extractImports');
    return importStatements;
}

(async () => {
    const args = process.argv.slice(2);
    let repoPath: string;
    let resultPath: string;
    if (args.length === 0) {
        // console.warn(
        //     'Please provide the path to the repo you want to analyze.',
        // );
        // process.exit(1);
        console.warn('No path provided, running in TEST MODE...');
        //  hardcode the paths here
        repoPath =
            '/Users/sebastianiscruleasa/extra/Master/Dissertation/DocumentationTests/habitica';
        resultPath =
            '/Users/sebastianiscruleasa/extra/Master/Dissertation/ImportFinder/demo/extracted-imports-habitica.json';
    } else {
        repoPath = args[0];
        resultPath = args[1] || './extracted-imports.json';
    }

    try {
        const imports = await extractImports(repoPath);
        await saveImportsToJsonFile(imports, resultPath);
        // await saveImportsToCsvFile(imports, './extracted-imports.csv');
    } catch (error) {
        console.error(
            'An error occurred during the extraction process:',
            error,
        );
        process.exit(1);
    }
})();
