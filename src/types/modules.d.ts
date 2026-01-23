declare module 'sql.js' {
  export interface Database {
    exec(sql: string): QueryExecResult[];
    close(): void;
  }

  export interface QueryExecResult {
    columns: string[];
    values: unknown[][];
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }

  export interface InitSqlJsOptions {
    locateFile?: (filename: string) => string;
  }

  export default function initSqlJs(options?: InitSqlJsOptions): Promise<SqlJsStatic>;
}

declare module 'pdf-parse' {
  interface PDFInfo {
    numpages: number;
    info: Record<string, unknown>;
  }

  interface PDFData {
    text: string;
    numpages: number;
    info: Record<string, unknown>;
  }

  interface PDFOptions {
    pagerender?: (pageData: {
      getTextContent: () => Promise<{ items: Array<{ str: string }> }>;
    }) => Promise<string>;
  }

  function pdfParse(buffer: Buffer, options?: PDFOptions): Promise<PDFData>;
  export default pdfParse;
}

declare module 'officeparser' {
  export function parseOfficeAsync(
    buffer: Buffer,
    options?: { outputErrorToConsole?: boolean }
  ): Promise<string>;
}
