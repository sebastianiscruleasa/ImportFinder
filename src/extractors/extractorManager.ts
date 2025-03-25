import { LanguageExtractor } from '../types';
import { createJavascriptExtractor, javascriptExtensions } from './javascript';
import { createJavaExtractor, javaExtensions } from './java';
import { groupFilesByExtension } from '../util';

export async function groupFilesByExtractor(
    repoPath: string,
): Promise<Map<LanguageExtractor, string[]>> {
    const groupedFilesByExtensions = await groupFilesByExtension(repoPath);
    const extensions = Array.from(groupedFilesByExtensions.keys());
    const extractorToFilesMap = new Map<LanguageExtractor, string[]>();

    const handledExtensions = new Set<string>();

    // JavaScript / TypeScript
    if (extensions.some((ext) => javascriptExtensions.includes(ext))) {
        const files = javascriptExtensions.flatMap(
            (ext) => groupedFilesByExtensions.get(ext) ?? [],
        );
        const jsExtractor = createJavascriptExtractor();
        extractorToFilesMap.set(jsExtractor, files);
        javascriptExtensions.forEach((ext) => handledExtensions.add(ext));
    }

    // Java
    if (extensions.some((ext) => javaExtensions.includes(ext))) {
        const files = javaExtensions.flatMap(
            (ext) => groupedFilesByExtensions.get(ext) ?? [],
        );
        const javaExtractor = await createJavaExtractor(repoPath);
        extractorToFilesMap.set(javaExtractor, files);
        javaExtensions.forEach((ext) => handledExtensions.add(ext));
    }

    // Log unhandled extensions
    const unhandledExtensions = extensions.filter(
        (ext) => !handledExtensions.has(ext),
    );
    if (unhandledExtensions.length > 0) {
        const details = unhandledExtensions.map((ext) => {
            const count = groupedFilesByExtensions.get(ext)?.length ?? 0;
            return `${ext} (${count})`;
        });
        console.warn(`Unhandled extensions found: ${details.join(', ')}`);
    }

    return extractorToFilesMap;
}
