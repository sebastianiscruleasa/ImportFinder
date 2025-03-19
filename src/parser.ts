import {
    getAllFiles,
    removeRepoPath,
    saveImportsToCsvFile,
    saveImportsToJsonFile,
} from './util';
import {
    extractImportsFromJavascriptTypescriptFile,
    javascriptExtensions,
    javascriptIgnoreList,
} from './javascriptUtil';
import {
    extractGroupIdsFromPoms,
    extractImportsFromJavastackFile,
    findRootPomXmlPaths,
    javastackExtensions,
    javastackIgnoreList,
} from './javastackUtil';
import { ImportStatement } from './types';

//TODO: handle javascript absolut imports

async function extractImportsFromRepo(
    repoPath: string,
): Promise<ImportStatement[]> {
    console.time('extractImportsFromRepo');
    const extensions = [...javascriptExtensions, ...javastackExtensions];
    const ignoreList = [...javascriptIgnoreList, ...javastackIgnoreList];

    // Infer java local prefix
    const rootPomXmlPaths = await findRootPomXmlPaths(repoPath);
    const groupIds = await extractGroupIdsFromPoms(rootPomXmlPaths);

    const files = await getAllFiles(repoPath, extensions, ignoreList); // Recursively get all matching files
    const importStatements: ImportStatement[] = [];

    for (const file of files) {
        const fileExtension = file.slice(file.lastIndexOf('.'));
        const relativePath = removeRepoPath(repoPath, file);
        if (javascriptExtensions.includes(fileExtension)) {
            const javascriptTypescriptImports =
                await extractImportsFromJavascriptTypescriptFile(
                    file,
                    relativePath,
                );
            importStatements.push(...javascriptTypescriptImports);
        } else if (javastackExtensions.includes(fileExtension)) {
            const javastackImports = await extractImportsFromJavastackFile(
                file,
                relativePath,
                groupIds,
            );
            importStatements.push(...javastackImports);
        } else {
            console.log(`Skipping unsupported file type: ${fileExtension}`);
        }
    }

    console.timeEnd('extractImportsFromRepo');
    return importStatements;
}

(async () => {
    // Get the folder path from command-line arguments
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error(
            'Please provide the path to the folder you want to analyze.',
        );
        process.exit(1);
    }
    const repoPath = args[0];

    try {
        const imports = await extractImportsFromRepo(repoPath);
        await saveImportsToJsonFile(imports, './extracted-imports.json');
        // await saveImportsToCsvFile(imports, './extracted-imports.csv');
    } catch (error) {
        console.error(
            'An error occurred during the extraction process:',
            error,
        );
        process.exit(1);
    }
})();
