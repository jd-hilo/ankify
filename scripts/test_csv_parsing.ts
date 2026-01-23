import * as fs from 'fs';
import Papa from 'papaparse';

// Import the findColumn function logic (updated version that prioritizes search list order)
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

const csvPath = '/Users/parlessgolf/Documents/FullAnkiCardCsv.csv';

console.log('Reading CSV file...');
const fileContent = fs.readFileSync(csvPath, 'utf-8');

// Show first few lines
const allLines = fileContent.split('\n');
console.log('\n=== First 3 lines of CSV ===');
allLines.slice(0, 3).forEach((line, i) => {
  console.log(`Line ${i + 1}:`, line.substring(0, 200));
});

// Test the double header detection logic
console.log('\n=== Testing Double Header Detection ===');
const lines = fileContent.split('\n').filter(line => line.trim().length > 0);

if (lines.length >= 2) {
  const firstLine = lines[0];
  const secondLine = lines[1];
  
  const firstLineTabs = firstLine.split('\t');
  const secondLineTabs = secondLine.split('\t');
  const firstLineHasManyUnderscores = (firstLine.match(/_/g) || []).length > 10;
  const secondLineHasSpaces = secondLine.includes(' ') && !secondLine.includes('_');
  
  console.log(`First line tabs: ${firstLineTabs.length}`);
  console.log(`Second line tabs: ${secondLineTabs.length}`);
  console.log(`First line has many underscores: ${firstLineHasManyUnderscores}`);
  console.log(`Second line has spaces: ${secondLineHasSpaces}`);
  
    if (firstLineTabs.length > 5 && firstLineHasManyUnderscores && secondLineHasSpaces && secondLineTabs.length < firstLineTabs.length) {
      console.log('✓ Double header detected!');
      
      // Use second line as actual headers (matches data structure)
      const headerResult = Papa.parse<string[]>(secondLine, {
        header: false,
        delimiter: '\t',
        skipEmptyLines: false,
      });
      
      if (headerResult.data.length > 0 && headerResult.data[0]) {
        const customHeaders = headerResult.data[0] as string[];
      console.log(`\nCustom headers (${customHeaders.length}):`);
      customHeaders.forEach((h, i) => {
        const normalized = h.toLowerCase().trim().replace(/\s+/g, '_');
        console.log(`  ${i}: "${h}" -> "${normalized}"`);
        if (normalized.includes('card') && normalized.includes('id') && !normalized.includes('note')) {
          console.log(`    *** This is a card ID column! ***`);
        }
      });
      
      // Test findColumn with normalized headers
      const normalizedHeaders = customHeaders.map(h => h.toLowerCase().trim().replace(/\s+/g, '_'));
      const cardIdCol = findColumn(normalizedHeaders, [
        'c_cardid',
        'с_cardid',
        'c_card_id',
        'card_id',
        'cardid',
        'card-id',
        'card.id',
        'card id',
        'id',
        'cid',
        'card_export_column__field_c',
        'card_export_column__field_b',
      ]);
      
      console.log(`\nfindColumn result: "${cardIdCol}"`);
      
      // Parse data starting from line 3 with tab delimiter
      const dataLines = lines.slice(2);
      console.log(`\nFirst data line (raw): "${dataLines[0]?.substring(0, 200)}"`);
      console.log(`First data line tabs: ${dataLines[0]?.split('\t').length}`);
      const dataContent = dataLines.join('\n');
      const dataResult = Papa.parse<string[]>(dataContent, {
        header: false,
        delimiter: '\t', // Explicitly use tab delimiter to match the 19 columns
        skipEmptyLines: true,
        quoteChar: '"',
        escapeChar: '"',
      });
      
      console.log(`\nParsed first row columns: ${dataResult.data[0]?.length}`);
      
      if (dataResult.data.length > 0 && cardIdCol) {
        const cardIdIndex = normalizedHeaders.indexOf(cardIdCol);
        console.log(`\nCard ID column index: ${cardIdIndex}`);
        console.log(`\nFirst 5 Card IDs from data:`);
        for (let i = 0; i < Math.min(5, dataResult.data.length); i++) {
          const row = dataResult.data[i] as string[];
          console.log(`  Row ${i + 1}: total columns=${row.length}, cardIdIndex=${cardIdIndex}`);
          if (cardIdIndex >= 0 && cardIdIndex < row.length) {
            const cardId = row[cardIdIndex];
            console.log(`    Card ID: "${cardId}"`);
          } else {
            console.log(`    Card ID: N/A (index out of range)`);
          }
          // Show a few columns around the card ID
          if (cardIdIndex >= 0) {
            const start = Math.max(0, cardIdIndex - 2);
            const end = Math.min(row.length, cardIdIndex + 3);
            console.log(`    Columns ${start}-${end}:`, row.slice(start, end).map((v, idx) => `[${start + idx}]="${v?.substring(0, 50)}"`).join(', '));
          }
        }
      } else if (!cardIdCol) {
        console.log('\n✗ Card ID column not found!');
      }
    }
  } else {
    console.log('✗ Double header NOT detected');
  }
}
