// Note: pdf-parse has issues with Next.js/webpack
// In production, consider using pdf2json or a serverless function
import pdfParse from 'pdf-parse';

export interface PdfSlide {
  slideNumber: number;
  content: string;
}

export interface ParsedPdf {
  slides: PdfSlide[];
}

/**
 * Parse a PDF file and extract page content
 * Each page is treated as a "slide"
 */
export async function parsePdf(fileBuffer: Buffer): Promise<ParsedPdf> {
  const data = await pdfParse(fileBuffer, {
    // Custom page render to get text per page
    pagerender: renderPage,
  });

  // Split by page markers we inserted
  const pageContents = data.text.split('---PAGE_BREAK---').filter(Boolean);

  const slides: PdfSlide[] = pageContents.map((content, index) => ({
    slideNumber: index + 1,
    content: cleanText(content),
  }));

  // Filter out empty slides
  return {
    slides: slides.filter((s) => s.content.length > 10),
  };
}

/**
 * Custom page render function to separate pages
 */
async function renderPage(pageData: {
  getTextContent: () => Promise<{
    items: Array<{ str: string }>;
  }>;
}) {
  const textContent = await pageData.getTextContent();
  const strings = textContent.items.map((item) => item.str);
  return strings.join(' ') + '---PAGE_BREAK---';
}

/**
 * Clean extracted text
 */
function cleanText(text: string): string {
  return text
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Remove common PDF artifacts
    .replace(/[•●○◦▪▫]/g, '')
    .replace(/\d+\s*\/\s*\d+/g, '') // Page numbers like "1/10"
    .trim();
}
