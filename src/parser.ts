import { getAllFiles, removeRepoPath, saveLibrariesToFile } from './util';
import {
    extractLibrariesFromJavascriptTypescriptFile,
    javascriptExtensions,
    javascriptIgnoreList,
} from './javascriptUtil';
import {
    extractLibrariesFromJavastackFile,
    inferJavaLocalPrefixes,
    javastackExtensions,
    javastackIgnoreList,
} from './javastackUtil';
import { ImportStatement } from './types';

//TODO: handle javascript absolut imports

async function extractLibrariesFromRepo(
    repoPath: string,
): Promise<ImportStatement[]> {
    console.time('extractLibrariesFromRepo');
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
            const javaImports = await extractLibrariesFromJavastackFile(
                file,
                relativePath,
                javaLocalPrefixes,
            );
            importStatements.push(...javaImports);
        } else {
            console.log(`Skipping unsupported file type: ${fileExtension}`);
        }
    }

    console.timeEnd('extractLibrariesFromRepo');
    return importStatements;
}

(async () => {
    const outputPath = './extracted-libraries.json'; // Define the output file name

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
        const libraries = await extractLibrariesFromRepo(repoPath);
        await saveLibrariesToFile(libraries, outputPath);
        console.log(`Libraries extracted and saved to ${outputPath}`);
    } catch (error) {
        console.error(
            'An error occurred during the extraction process:',
            error,
        );
        process.exit(1);
    }
})();
