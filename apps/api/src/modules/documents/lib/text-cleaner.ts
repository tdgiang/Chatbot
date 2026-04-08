/**
 * Cleans raw text extracted from PDF/DOCX before chunking.
 * Removes: page numbers, government headers, watermarks, signatures, excess whitespace.
 */
export function cleanText(raw: string): string {
  return (
    raw
      // Remove standalone page numbers (lines containing only 1–3 digits)
      .replace(/^\s*\d{1,3}\s*$/gm, '')

      // Remove Vietnamese government document header block:
      // "BỘ CÔNG AN ... CỘNG HÒA ... ĐỘC LẬP ... DỰ THẢO"
      .replace(/BỘ CÔNG AN[\s\S]{0,500}?DỰ THẢO[ \t]*\n?/gm, '')

      // Remove standalone "DỰ THẢO" watermark on its own line
      .replace(/^\s*DỰ THẢO\s*$/gm, '')

      // Remove signature block at end of document
      .replace(/KT\.\s*BỘ TRƯỞNG[\s\S]*$/m, '')
      .replace(/THỨ TRƯỞNG[\s\S]{0,300}$/m, '')

      // Remove decorative separator lines (dashes, equal signs, box-drawing chars)
      .replace(/^[\-─═─=─]{3,}\s*$/gm, '')

      // Collapse 3+ blank lines → 2
      .replace(/\n{3,}/g, '\n\n')

      // Normalize spaces/tabs within a line
      .replace(/[ \t]+/g, ' ')

      // Trim each line
      .split('\n')
      .map((l) => l.trim())
      .join('\n')

      .trim()
  );
}
