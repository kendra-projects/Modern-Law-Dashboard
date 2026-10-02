declare module "html-to-docx" {
  /**
   * Converts an HTML string into a .docx document. In Node it resolves to a
   * Buffer; the second/fourth args are optional header/footer HTML.
   */
  const HTMLtoDOCX: (
    html: string,
    headerHTMLString?: string | null,
    documentOptions?: Record<string, unknown>,
    footerHTMLString?: string | null
  ) => Promise<Buffer>
  export default HTMLtoDOCX
}
