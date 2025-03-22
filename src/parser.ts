import { getAllFiles, saveImportsToJsonFile } from './util';
import {
    extractImportsFromJavascriptTypescriptFile,
    javascriptExtensions,
    javascriptIgnoreList,
} from './javascriptUtil';
import {
    findGroupIds,
    extractImportsFromJavaFile,
    findProjectPath,
    findRootPomXmlPaths,
    generateImportedClassToJarMaps,
    javaExtensions,
    javaIgnoreList,
} from './javaUtil';
import { ImportStatement } from './types';

//TODO: handle javascript absolut imports

async function extractImportsFromRepo(
    repoPath: string,
): Promise<ImportStatement[]> {
    console.time('extractImportsFromRepo');
    const extensions = [...javascriptExtensions, ...javaExtensions];
    const ignoreList = [...javascriptIgnoreList, ...javaIgnoreList];

    const files = await getAllFiles(repoPath, extensions, ignoreList);
    const importStatements: ImportStatement[] = [];

    const rootPomXmlPaths = await findRootPomXmlPaths(repoPath);
    const [groupIds, importedClassToJarMaps] = await Promise.all([
        findGroupIds(rootPomXmlPaths),
        generateImportedClassToJarMaps(rootPomXmlPaths),
    ]);

    for (const file of files) {
        const fileExtension = file.slice(file.lastIndexOf('.'));
        if (javascriptExtensions.includes(fileExtension)) {
            const javascriptTypescriptImports =
                await extractImportsFromJavascriptTypescriptFile(
                    file,
                    repoPath,
                );
            importStatements.push(...javascriptTypescriptImports);
        } else if (javaExtensions.includes(fileExtension)) {
            const projectPath = findProjectPath(
                file,
                Array.from(importedClassToJarMaps.keys()),
            );

            const javaImports = await extractImportsFromJavaFile(
                file,
                repoPath,
                groupIds,
                projectPath
                    ? importedClassToJarMaps.get(projectPath)
                    : undefined,
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
        await saveImportsToJsonFile(imports, './extracted-imports1.json');
        // await saveImportsToCsvFile(imports, './extracted-imports.csv');
    } catch (error) {
        console.error(
            'An error occurred during the extraction process:',
            error,
        );
        process.exit(1);
    }
})();
