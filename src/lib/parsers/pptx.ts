import officeparser from 'officeparser';

export interface PptxSlide {
  slideNumber: number;
  content: string;
}

export interface ParsedPptx {
  slides: PptxSlide[];
}

/**
 * Parse a PPTX file and extract slide content
 */
export async function parsePptx(fileBuffer: Buffer): Promise<ParsedPptx> {
  return new Promise((resolve, reject) => {
    officeparser.parseOfficeAsync(fileBuffer, {
      outputErrorToConsole: false,
    })
      .then((text: string) => {
        // officeparser returns all text concatenated
        // We need to split by slides - typically separated by double newlines
        // This is an approximation since PPTX structure is complex

        // Try to identify slide boundaries
        const slideTexts = splitIntoSlides(text);

        const slides: PptxSlide[] = slideTexts.map((content, index) => ({
          slideNumber: index + 1,
          content: cleanText(content),
        }));

        // Filter out empty slides
        resolve({
          slides: slides.filter((s) => s.content.length > 10),
        });
      })
      .catch(reject);
  });
}

/**
 * Attempt to split PPTX text into individual slides
 * This is a heuristic approach since officeparser doesn't preserve slide boundaries
 */
function splitIntoSlides(text: string): string[] {
  // Common patterns that might indicate slide breaks
  // - Multiple consecutive newlines
  // - Slide title patterns (often in caps or followed by colon)

  // First, try splitting by triple newlines (common separator)
  let slides = text.split(/\n{3,}/);

  // If that gives us too few "slides", try double newlines
  if (slides.length < 5) {
    slides = text.split(/\n{2,}/);
  }

  // If still too few, split by paragraph-like chunks
  if (slides.length < 3) {
    // Split into chunks of roughly similar size
    const words = text.split(/\s+/);
    const chunkSize = Math.ceil(words.length / 10); // Assume ~10 slides
    slides = [];
    for (let i = 0; i < words.length; i += chunkSize) {
      slides.push(words.slice(i, i + chunkSize).join(' '));
    }
  }

  return slides.filter((s) => s.trim().length > 0);
}

/**
 * Clean extracted text
 */
function cleanText(text: string): string {
  return text
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Remove common bullet points
    .replace(/[•●○◦▪▫]/g, '')
    // Remove slide numbers
    .replace(/^\d+\s*[-–—]\s*/gm, '')
    .replace(/\bSlide\s+\d+\b/gi, '')
    .trim();
}
