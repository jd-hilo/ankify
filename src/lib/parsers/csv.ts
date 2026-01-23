import Papa from 'papaparse';
import crypto from 'crypto';

export interface CsvCard {
  cardId: string;
  front: string;
  frontRaw: string;  // For CSV, same as front (no raw Anki formatting available)
  back: string;
  tags: string[];
}

export interface ParsedCsv {
  cards: CsvCard[];
  versionHash: string;
}

export interface ParsedCsvStreaming {
  cardCount: number;
  versionHash: string;
}

interface CsvRow {
  [key: string]: string | undefined;
}

/**
 * Parse a CSV/TXT file exported from Anki
 *
 * Expected formats:
 * 1. Standard Anki export: front, back (tab or comma separated)
 * 2. With card ID: card_id, front, back
 * 3. With tags: card_id, front, back, tags
 *
 * The parser auto-detects the format based on headers or content
 */
export async function parseCsv(fileContent: string): Promise<ParsedCsv> {
  // Preprocess: Fix common Anki export quote issues
  // Anki sometimes exports with triple quotes like """text"" which breaks standard CSV parsing
  let cleanedContent = fileContent;
  
  // Try to fix trailing quotes and triple quotes
  // Pattern: """text"" -> "text"
  cleanedContent = cleanedContent.replace(/"""/g, '"');
  
  // Remove BOM if present (UTF-8 BOM: EF BB BF)
  if (cleanedContent.charCodeAt(0) === 0xFEFF) {
    cleanedContent = cleanedContent.slice(1);
  }
  
  // Check if CSV has two header rows (common in Anki exports)
  // First row contains metadata field names, second row is actual column headers
  // Data aligns with second header row
  const lines = cleanedContent.split('\n').filter(line => line.trim().length > 0);
  let contentToParse = cleanedContent;
  let customHeaders: string[] | null = null;
  
  if (lines.length >= 2) {
    const firstLine = lines[0];
    const secondLine = lines[1];
    
    // Check if first line has many columns with underscores (metadata) 
    // and second line has fewer columns with spaces (actual headers)
    const firstLineTabs = firstLine.split('\t');
    const secondLineTabs = secondLine.split('\t');
    const firstLineHasManyUnderscores = (firstLine.match(/_/g) || []).length > 10;
    const secondLineHasSpaces = secondLine.includes(' ') && !secondLine.includes('_');
    
    // If first line is metadata and second line is actual headers
    if (firstLineTabs.length > 5 && firstLineHasManyUnderscores && secondLineHasSpaces && secondLineTabs.length < firstLineTabs.length) {
      // Use second line as actual headers (this matches the data structure)
      const headerResult = Papa.parse<string[]>(secondLine, {
        header: false,
        delimiter: '\t',
        skipEmptyLines: false,
      });
      
      if (headerResult.data.length > 0 && headerResult.data[0]) {
        customHeaders = headerResult.data[0] as string[];
        // Skip both header rows, parse from third line onwards
        const dataLines = lines.slice(2);
        contentToParse = dataLines.join('\n');
        console.log(`CSV: detected double header format, using second row as headers (${customHeaders.length} columns), skipping first metadata row`);
      }
    }
  }
  
  // Parse the CSV with auto-detection and lenient quote handling
  const result = customHeaders 
    ? Papa.parse<string[]>(contentToParse, {
        header: false,
        skipEmptyLines: 'greedy',
        delimiter: '\t',
        quoteChar: '"',
        escapeChar: '"',
      })
    : Papa.parse<CsvRow>(contentToParse, {
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader: (header) => header.toLowerCase().trim().replace(/\s+/g, '_'),
        delimiter: '',
        quoteChar: '"',
        escapeChar: '"',
      });

  // Handle custom headers case (double header format)
  if (customHeaders && Array.isArray(result.data) && result.data.length > 0 && Array.isArray(result.data[0])) {
    // Convert array rows to object rows using custom headers
    const normalizedHeaders = customHeaders.map(h => h.toLowerCase().trim().replace(/\s+/g, '_'));
    const dataAsObjects: CsvRow[] = (result.data as string[][]).map(row => {
      const obj: CsvRow = {};
      normalizedHeaders.forEach((header, index) => {
        obj[header] = row[index] || '';
      });
      return obj;
    });
    console.log(`CSV headers detected (custom): ${JSON.stringify(normalizedHeaders)}`);
    return processHeaders(normalizedHeaders, dataAsObjects);
  }

  if (result.errors.length > 0) {
    // Try parsing without quote handling (for malformed Anki exports)
    const resultNoQuotes = Papa.parse<CsvRow>(cleanedContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.toLowerCase().trim(),
      delimiter: '', // Auto-detect
      quoteChar: '', // Disable quote handling
    });
    
    if (resultNoQuotes.errors.length === 0 && resultNoQuotes.data.length > 0) {
      const headers = resultNoQuotes.meta.fields || [];
      console.log(`CSV headers detected (no quotes mode): ${JSON.stringify(headers)}`);
      return processHeaders(headers, resultNoQuotes.data);
    }

    // Try parsing without headers (Anki's default export format)
    console.log('CSV: trying to parse without headers');
    const resultNoHeader = Papa.parse<string[]>(cleanedContent, {
      header: false,
      skipEmptyLines: true,
      delimiter: '', // Auto-detect
      quoteChar: '',
    });

    if (resultNoHeader.errors.length > 0) {
      throw new Error(`Failed to parse CSV: ${result.errors[0].message}`);
    }

    console.log('CSV: parsed without headers, will generate card IDs');
    return parseNoHeaderCsv(resultNoHeader.data);
  }

  // Detect columns (normal single header case)
  const headers = result.meta.fields || [];
  const data = result.data as CsvRow[];

  console.log(`CSV headers detected: ${JSON.stringify(headers)}`);
  
  return processHeaders(headers, data);
}

/**
 * Process CSV data with known headers
 */
function processHeaders(headers: string[], data: CsvRow[]): ParsedCsv {
  if (data.length === 0) {
    throw new Error('CSV file is empty');
  }

  // Map column names to our expected format
  // Prefer true card ID fields; only fall back to note IDs if nothing else exists
  const cardIdCol = findColumn(headers, [
    'c_cardid',      // Card Exporter plugin (Latin 'c' variant)
    'с_cardid',      // Cyrillic 'с' variant (Card Exporter plugin)
    'c_card_id',     // Card Exporter plugin with underscore
    'card_id',
    'cardid',
    'card-id',       // Hyphen variant
    'card.id',       // Dot variant
    'card id',       // Space variant (e.g., "Card ID")
    'id',
    'cid',           // Common abbreviation
    'card_export_column__field_c',
    'card_export_column__field_b',
  ]);
  
  // Fallback: search for columns containing both "card" and "id" (case-insensitive)
  let fallbackCardIdCol: string | null = null;
  if (!cardIdCol) {
    for (const header of headers) {
      const normalized = header.toLowerCase().trim().replace(/\s+/g, '_');
      if ((normalized.includes('card') && normalized.includes('id')) && 
          !normalized.includes('note') && 
          normalized !== 'card_type' && 
          normalized !== 'card_export_column__field_a') {
        fallbackCardIdCol = header;
        console.log(`CSV: found potential card ID column via fallback search: "${header}"`);
        break;
      }
    }
  }
  
  const finalCardIdCol = cardIdCol || fallbackCardIdCol;
  
  const noteIdCol = finalCardIdCol
    ? null
    : findColumn(headers, ['note_id', 'nid', 'c_noteid', 'с_noteid']);
  
  if (finalCardIdCol) {
    console.log(`CSV: found card ID column "${finalCardIdCol}"`);
  } else if (noteIdCol) {
    console.log(
      `CSV: using note ID column "${noteIdCol}" as card_id (may reduce unique card count)`
    );
  } else {
    console.log('CSV: no card ID column found, will generate IDs from content');
  }
  const frontCol = findColumn(headers, ['front', 'question', 'field1', 'term']);
  // For back/answer, prefer 'allrevs' (full text with cloze deletions filled) over 'answer' (which is just "Cloze 1")
  const backCol = findColumn(headers, ['allrevs', 'back', 'answer', 'field2', 'definition']);
  const tagsCol = findColumn(headers, ['tags', 'tag']);

  const cards: CsvCard[] = [];
  let rowIndex = 0;

  for (const row of data) {
    rowIndex++;

    // Get front and back content
    let front = '';
    let back = '';

    if (frontCol && backCol) {
      front = cleanText(row[frontCol] || '');
      back = cleanText(row[backCol] || '');
    } else {
      // If no recognized headers, use first two columns
      const values = Object.values(row);
      front = cleanText(values[0] || '');
      back = cleanText(values[1] || '');
    }

    // Skip empty rows
    if (!front && !back) continue;

    // Get card ID (generate if not present)
    let cardId = '';
    if (finalCardIdCol && row[finalCardIdCol] !== undefined && row[finalCardIdCol] !== null && String(row[finalCardIdCol]).trim() !== '') {
      // Ensure card ID is treated as string (Anki IDs are large integers or hex strings)
      cardId = String(row[finalCardIdCol]).trim();
      if (rowIndex <= 3) {
        console.log(`CSV row ${rowIndex}: using card ID from column "${finalCardIdCol}": ${cardId}`);
      }
    } else if (noteIdCol && row[noteIdCol] !== undefined && row[noteIdCol] !== null && String(row[noteIdCol]).trim() !== '') {
      cardId = String(row[noteIdCol]).trim();
      if (rowIndex <= 3) {
        console.log(`CSV row ${rowIndex}: using note ID from column "${noteIdCol}": ${cardId}`);
      }
    } else {
      // Generate deterministic ID from content
      cardId = crypto
        .createHash('md5')
        .update(`${front}|${back}`)
        .digest('hex')
        .slice(0, 12);
      if (rowIndex <= 3) {
        console.log(`CSV row ${rowIndex}: generated hash ID: ${cardId} (card_id column "${finalCardIdCol || 'none'}" was empty or not found)`);
      }
    }

    // Get tags
    let tags: string[] = [];
    if (tagsCol && row[tagsCol]) {
      tags = row[tagsCol]
        .split(/[,;\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);
    }

    cards.push({ cardId, front, frontRaw: front, back, tags });
  }

  if (cards.length === 0) {
    throw new Error('No valid cards found in CSV');
  }

  // Deduplicate cards by card_id (keep first occurrence)
  const uniqueCards: CsvCard[] = [];
  const seenIds = new Set<string>();
  let duplicateCount = 0;

  for (const card of cards) {
    if (!seenIds.has(card.cardId)) {
      uniqueCards.push(card);
      seenIds.add(card.cardId);
    } else {
      duplicateCount++;
    }
  }

  if (duplicateCount > 0) {
    console.log(`Removed ${duplicateCount} duplicate cards from CSV`);
  }

  // Generate version hash
  const contentForHash = uniqueCards
    .map((c) => `${c.cardId}:${c.front}:${c.back}`)
    .sort()
    .join('|');
  const versionHash = crypto
    .createHash('sha256')
    .update(contentForHash)
    .digest('hex')
    .slice(0, 16);

  return { cards: uniqueCards, versionHash };
}

/**
 * Get the total card count from a CSV file without full processing.
 * Useful for progress tracking.
 */
export function getCsvCardCount(fileContent: string): number {
  // Quick count by counting non-empty lines
  const lines = fileContent.split('\n').filter((line) => line.trim().length > 0);
  // Subtract 1 for header if present (heuristic: first line contains common header words)
  const firstLine = lines[0]?.toLowerCase() || '';
  const hasHeader = ['front', 'back', 'question', 'answer', 'card_id', 'tags'].some(
    (word) => firstLine.includes(word)
  );
  return hasHeader ? lines.length - 1 : lines.length;
}

/**
 * Parse a CSV file and yield cards in batches to reduce memory pressure.
 *
 * @param fileContent - The CSV file content as a string
 * @param batchSize - Number of cards per batch (default: 500)
 * @param onBatch - Callback for each batch of cards
 */
export async function parseCsvStreaming(
  fileContent: string,
  batchSize: number = 500,
  onBatch: (cards: CsvCard[], batchIndex: number) => Promise<void>
): Promise<ParsedCsvStreaming> {
  // Parse the entire CSV first (CSV files are typically smaller than APKG)
  const parsed = await parseCsv(fileContent);

  // Process in batches
  let batchIndex = 0;
  for (let i = 0; i < parsed.cards.length; i += batchSize) {
    const batch = parsed.cards.slice(i, i + batchSize);
    await onBatch(batch, batchIndex);
    batchIndex++;
  }

  return {
    cardCount: parsed.cards.length,
    versionHash: parsed.versionHash,
  };
}

/**
 * Parse CSV without headers (Anki's default tab-separated export)
 */
function parseNoHeaderCsv(data: string[][]): ParsedCsv {
  const cards: CsvCard[] = [];

  for (const row of data) {
    if (row.length < 2) continue;

    const front = cleanText(row[0]);
    const back = cleanText(row[1]);
    const tags = row[2] ? row[2].split(/\s+/).filter(Boolean) : [];

    if (!front && !back) continue;

    // Generate deterministic ID
    const cardId = crypto
      .createHash('md5')
      .update(`${front}|${back}`)
      .digest('hex')
      .slice(0, 12);

    cards.push({ cardId, front, frontRaw: front, back, tags });
  }

  if (cards.length === 0) {
    throw new Error('No valid cards found in CSV');
  }

  const contentForHash = cards
    .map((c) => `${c.cardId}:${c.front}:${c.back}`)
    .sort()
    .join('|');
  const versionHash = crypto
    .createHash('sha256')
    .update(contentForHash)
    .digest('hex')
    .slice(0, 16);

  return { cards, versionHash };
}

/**
 * Find a column by checking multiple possible names
 * Headers are already normalized by PapaParse (lowercase, spaces->underscores)
 * Returns the first match based on priority order of possibleNames, not header order
 */
function findColumn(headers: string[], possibleNames: string[]): string | null {
  // Normalize possible names to match PapaParse's transformHeader format
  const normalizedPossibleNames = possibleNames.map(name => 
    name.toLowerCase().trim().replace(/\s+/g, '_')
  );
  
  // Create a map of normalized headers to original headers for quick lookup
  const headerMap = new Map<string, string>();
  for (const header of headers) {
    const normalized = header.toLowerCase().trim().replace(/\s+/g, '_');
    headerMap.set(normalized, header);
  }
  
  // Check possible names in priority order (first match wins)
  for (const normalizedPossibleName of normalizedPossibleNames) {
    if (headerMap.has(normalizedPossibleName)) {
      return headerMap.get(normalizedPossibleName)!; // Return the actual header name
    }
  }
  
  return null;
}

/**
 * Clean text content
 */
function cleanText(text: string): string {
  return text
    // Remove HTML tags
    .replace(/<[^>]*>/g, ' ')
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Remove Anki cloze deletion markers: {{c1::text}} -> text
    .replace(/\{\{c\d+::([^}]+)\}\}/g, '$1')
    // Remove hint markers: {{c1::text::hint}} -> text
    .replace(/\{\{c\d+::([^:}]+)::[^}]+\}\}/g, '$1')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}
