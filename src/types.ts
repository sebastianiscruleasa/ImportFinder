export interface ImportStatement {
    file: string;
    importedEntity: string;
    modifiers: string[];
    language: string;
    library?: string;
    fullImport: string;
}

export interface LanguageExtractor {
    isIgnored: (file: string) => boolean;
    extractImports: (
        filePath: string,
        repoPath: string,
    ) => Promise<ImportStatement[]>;
}
