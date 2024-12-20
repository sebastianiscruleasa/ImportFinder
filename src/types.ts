export interface ImportStatement {
    file: string;
    importedEntity: string;
    modifiers: string[];
    language: string;
    library?: string;
    fullImport: string;
}
