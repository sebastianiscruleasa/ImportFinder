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
    if (args.length === 0) {
        // console.warn(
        //     'Please provide the path to the repo you want to analyze.',
        // );
        // process.exit(1);
        console.warn('No path provided, running in TEST MODE...');
        repoPath =
            '/Users/sebastianiscruleasa/extra/Projects/Meetvent Project/MeetventDepinderTest'; // <--- hardcode a test path here
        // repoPath =
        //     '/Users/sebastianiscruleasa/extra/Master/Dissertation/TestingRepos/nodejs-goof';
    } else {
        repoPath = args[0];
    }

    try {
        const imports = await extractImports(repoPath);
        await saveImportsToJsonFile(
            imports,
            './extracted-imports-meetvent-experiment-plugin.json',
            // './extracted-imports-nodejs-goof-experiment.json',
        );
        // await saveImportsToCsvFile(imports, './extracted-imports.csv');
    } catch (error) {
        console.error(
            'An error occurred during the extraction process:',
            error,
        );
        process.exit(1);
    }
})();
