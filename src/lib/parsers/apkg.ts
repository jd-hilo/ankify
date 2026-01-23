import JSZip from 'jszip';
import initSqlJs, { Database } from 'sql.js';
import crypto from 'crypto';

export interface AnkiCard {
  cardId: string;
  noteId: string;
  front: string;      // Cleaned text for search/matching
  frontRaw: string;   // Raw text for exact Anki matching
  back: string;
  tags: string[];
}

export interface ParsedDeck {
  cards: AnkiCard[];
  versionHash: string;
}

export interface ParsedDeckStreaming {
  cardCount: number;
  versionHash: string;
}

// SQL.js instance cache to avoid re-initialization
let sqlJsInstance: Awaited<ReturnType<typeof initSqlJs>> | null = null;
let wasmBinaryCache: ArrayBuffer | null = null;

async function getSqlJs() {
  if (!sqlJsInstance) {
    // Fetch the WASM binary if not cached
    if (!wasmBinaryCache) {
      const wasmUrl = 'https://sql.js.org/dist/sql-wasm.wasm';
      console.log('Fetching SQL.js WASM from:', wasmUrl);
      const wasmResponse = await fetch(wasmUrl);
      if (!wasmResponse.ok) {
        throw new Error(`Failed to fetch WASM: ${wasmResponse.status}`);
      }
      wasmBinaryCache = await wasmResponse.arrayBuffer();
      console.log('WASM loaded, size:', wasmBinaryCache.byteLength);
    }
    
    sqlJsInstance = await initSqlJs({
      wasmBinary: wasmBinaryCache,
    });
  }
  return sqlJsInstance;
}

/**
 * Get the total card count from an APKG file without parsing all content.
 * Useful for progress tracking before starting full processing.
 */
export async function getApkgCardCount(fileBuffer: ArrayBuffer): Promise<number> {
  const zip = await JSZip.loadAsync(fileBuffer);

  const dbFile = zip.file('collection.anki2') || zip.file('collection.anki21');
  if (!dbFile) {
    throw new Error('Invalid APKG file: no collection database found');
  }

  const dbBuffer = await dbFile.async('arraybuffer');
  const SQL = await getSqlJs();
  const db: Database = new SQL.Database(new Uint8Array(dbBuffer));

  try {
    // Count cards (not notes, since cloze notes create multiple cards)
    const result = db.exec('SELECT COUNT(*) FROM cards');
    return (result[0]?.values[0]?.[0] as number) || 0;
  } finally {
    db.close();
  }
}

/**
 * Parse an APKG file and yield cards in batches to reduce memory pressure.
 * Use this for large decks to avoid loading all cards into memory.
 *
 * @param fileBuffer - The APKG file as an ArrayBuffer
 * @param batchSize - Number of cards per batch (default: 500)
 * @param onBatch - Callback for each batch of cards
 * @param onTotalKnown - Callback when total card count is known (for progress)
 */
export async function parseApkgStreaming(
  fileBuffer: ArrayBuffer,
  batchSize: number = 500,
  onBatch: (cards: AnkiCard[], batchIndex: number) => Promise<void>
): Promise<ParsedDeckStreaming> {
  // Load the ZIP file
  const zip = await JSZip.loadAsync(fileBuffer);

  // Find the SQLite database file
  const dbFile = zip.file('collection.anki2') || zip.file('collection.anki21');
  if (!dbFile) {
    throw new Error('Invalid APKG file: no collection database found');
  }

  // Extract the database content
  const dbBuffer = await dbFile.async('arraybuffer');

  // Initialize SQL.js (cached)
  const SQL = await getSqlJs();

  // Open the database
  const db: Database = new SQL.Database(new Uint8Array(dbBuffer));

  try {
    // Get total counts for progress tracking
    const countResult = db.exec('SELECT COUNT(*) FROM notes');
    const totalNotes = countResult[0]?.values[0]?.[0] as number || 0;

    // Build card-to-note map first (this is small, just IDs)
    const cardsResult = db.exec(`
      SELECT c.id as card_id, c.nid as note_id, c.ord as card_ord
      FROM cards c
    `);

    const noteToCards = new Map<string, { cardId: string; ord: number }[]>();
    if (cardsResult.length > 0 && cardsResult[0].values) {
      for (const row of cardsResult[0].values) {
        const cardId = String(row[0]);
        const noteId = String(row[1]);
        const ord = Number(row[2]);
        if (!noteToCards.has(noteId)) {
          noteToCards.set(noteId, []);
        }
        noteToCards.get(noteId)!.push({ cardId, ord });
      }
    }

    // Process notes in batches using LIMIT/OFFSET
    let offset = 0;
    let batchIndex = 0;
    let totalCards = 0;
    const hashBuilder = crypto.createHash('sha256');

    while (offset < totalNotes) {
      const notesResult = db.exec(`
        SELECT n.id as note_id, n.flds as fields, n.tags as tags
        FROM notes n
        LIMIT ${batchSize} OFFSET ${offset}
      `);

      if (notesResult.length === 0 || !notesResult[0].values) {
        break;
      }

      const batch: AnkiCard[] = [];

      for (const row of notesResult[0].values) {
        const noteId = String(row[0]);
        const fields = String(row[1]);
        const tagsStr = String(row[2]);

        const fieldParts = fields.split('\x1f');
        const frontRaw = fieldParts[0] || '';  // Raw text for exact Anki matching
        const front = cleanHtml(frontRaw);      // Cleaned text for search
        const back = cleanHtml(fieldParts.slice(1).join(' ') || '');
        const tags = tagsStr.trim().split(/\s+/).filter(Boolean);

        const cardsList = noteToCards.get(noteId) || [];

        if (cardsList.length === 0) {
          const card = { cardId: noteId, noteId, front, frontRaw, back, tags };
          batch.push(card);
          hashBuilder.update(`${card.cardId}:${card.front}:${card.back}|`);
        } else {
          for (const cardInfo of cardsList) {
            const card = { cardId: cardInfo.cardId, noteId, front, frontRaw, back, tags };
            batch.push(card);
            hashBuilder.update(`${card.cardId}:${card.front}:${card.back}|`);
          }
        }
      }

      totalCards += batch.length;

      // Process this batch
      await onBatch(batch, batchIndex);

      // Clear batch from memory
      batch.length = 0;

      offset += batchSize;
      batchIndex++;
    }

    const versionHash = hashBuilder.digest('hex').slice(0, 16);

    return { cardCount: totalCards, versionHash };
  } finally {
    db.close();
  }
}

/**
 * Parse an APKG file and extract card data (legacy - loads all into memory)
 * Use parseApkgStreaming for large decks.
 *
 * APKG files are ZIP archives containing:
 * - collection.anki2 or collection.anki21 (SQLite database)
 * - media file (JSON mapping of media filenames)
 */
export async function parseApkg(fileBuffer: ArrayBuffer): Promise<ParsedDeck> {
  const cards: AnkiCard[] = [];

  const result = await parseApkgStreaming(
    fileBuffer,
    1000, // Larger batch for in-memory operation
    async (batch) => {
      cards.push(...batch);
    }
  );

  return { cards, versionHash: result.versionHash };
}

/**
 * Clean HTML from card content
 */
function cleanHtml(html: string): string {
  return html
    // Remove HTML tags
    .replace(/<[^>]*>/g, ' ')
    // Remove cloze deletion markers but keep content
    .replace(/\{\{c\d+::([^}:]+)(?:::[^}]*)?\}\}/g, '$1')
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Remove media references
    .replace(/\[sound:[^\]]+\]/g, '')
    .replace(/<img[^>]*>/gi, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}
