import { getAllFiles, removeRepoPath, saveImportsToFile } from './util';
import {
    extractImportsFromJavascriptTypescriptFile,
    javascriptExtensions,
    javascriptIgnoreList,
} from './javascriptUtil';
import {
    extractImportsFromJavastackFile,
    inferJavaLocalPrefixes,
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

    // Infer java local prefixes
    const javaLocalPrefixes = await inferJavaLocalPrefixes(repoPath);

    const files = await getAllFiles(repoPath, extensions, ignoreList); // Recursively get all matching files
    const importStatements: ImportStatement[] = [];

    for (const file of files) {
        const fileExtension = file.slice(file.lastIndexOf('.'));
        const relativePath = removeRepoPath(repoPath, file);
        // if (javascriptExtensions.includes(fileExtension)) {
        //     libraries[relativePath] =
        //         await extractLibrariesFromJavascriptTypescriptFile(file);
        // } else
        if (javastackExtensions.includes(fileExtension)) {
            const javaImports = await extractImportsFromJavastackFile(
                file,
                relativePath,
                javaLocalPrefixes,
            );
            importStatements.push(...javaImports);
        } else {
            console.log(`Skipping unsupported file type: ${fileExtension}`);
        }
    }

    console.timeEnd('extractImportsFromRepo');
    return importStatements;
}

(async () => {
    const outputPath = './extracted-imports.json'; // Define the output file name

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
        await saveImportsToFile(imports, outputPath);
        console.log(`Imports extracted and saved to ${outputPath}`);
    } catch (error) {
        console.error(
            'An error occurred during the extraction process:',
            error,
        );
        process.exit(1);
    }
})();
