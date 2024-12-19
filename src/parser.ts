import {
    ExtractedLibraries,
    getAllFiles,
    removeRepoPath,
    saveLibrariesToFile,
} from './util';
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

//TODO: handle javascript absolut imports

async function extractLibrariesFromRepo(
    repoPath: string,
): Promise<ExtractedLibraries> {
    console.time('extractLibrariesFromRepo');
    const extensions = [...javascriptExtensions, ...javastackExtensions];
    const ignoreList = [...javascriptIgnoreList, ...javastackIgnoreList];

    // Infer java local prefixes
    const javaLocalPrefixes = await inferJavaLocalPrefixes(repoPath);

    const files = await getAllFiles(repoPath, extensions, ignoreList); // Recursively get all matching files
    const libraries: ExtractedLibraries = {};

    for (const file of files) {
        const relativePath = removeRepoPath(repoPath, file); // Convert to relative path
        const fileExtension = relativePath.slice(relativePath.lastIndexOf('.'));
        if (javascriptExtensions.includes(fileExtension)) {
            libraries[relativePath] =
                await extractLibrariesFromJavascriptTypescriptFile(file);
        } else if (javastackExtensions.includes(fileExtension)) {
            libraries[relativePath] = await extractLibrariesFromJavastackFile(
                file,
                javaLocalPrefixes,
            );
        } else {
            console.log(`Skipping unsupported file type: ${fileExtension}`);
        }
    }

    console.timeEnd('extractLibrariesFromRepo');
    return libraries;
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
