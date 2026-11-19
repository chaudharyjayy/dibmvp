/** Minimal typing for the browser build of pdfjs-dist used by the PDF upload. */
declare module "pdfjs-dist/build/pdf.mjs" {
  export const GlobalWorkerOptions: { workerSrc: string };

  export type TextContentItem = { str?: string };

  export type PDFPageProxy = {
    getTextContent(): Promise<{ items: TextContentItem[] }>;
  };

  export type PDFDocumentProxy = {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
    destroy(): Promise<void>;
  };

  export function getDocument(params: {
    data: Uint8Array;
    useSystemFonts?: boolean;
  }): { promise: Promise<PDFDocumentProxy> };
}
