import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { AlignmentType } from '@/types/database';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType as DocxAlignmentType } from 'docx';

interface Params {
  params: Promise<{ lectureId: string }>;
}

interface ExportAlignment {
  alignment_type: AlignmentType;
  similarity_score: number;
  llm_reasoning: string;
  slide_concepts: { slide_number: number; concept_summary: string };
  card_concepts: { card_id: string; concept_summary: string; tags: string[] | null; deck_id: string };
}

interface LectureSummary {
  id: string;
  name: string;
}

interface RawCard {
  card_id: string;
  front: string;
  front_raw: string | null;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { lectureId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify lecture ownership and get lecture name
  const { data: lectureData, error: lectureError } = await supabase
    .from('lectures')
    .select('id, name')
    .eq('id', lectureId)
    .eq('user_id', user.id)
    .single();

  if (lectureError || !lectureData) {
    return NextResponse.json({ error: 'Lecture not found' }, { status: 404 });
  }

  const lecture = lectureData as LectureSummary;

  // Get query params
  const url = new URL(request.url);
  const format = url.searchParams.get('format') || 'txt';
  const alignmentType = url.searchParams.get('alignmentType');
  const customTag = url.searchParams.get('tag');

  // Build query
  let query = supabase
    .from('card_alignments')
    .select(`
      alignment_type,
      similarity_score,
      llm_reasoning,
      slide_concepts(slide_number, concept_summary),
      card_concepts(card_id, concept_summary, tags, deck_id)
    `)
    .eq('lecture_id', lectureId);

  if (alignmentType) {
    query = query.eq('alignment_type', alignmentType);
  }

  const { data: alignmentsData, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!alignmentsData || alignmentsData.length === 0) {
    return NextResponse.json({ error: 'No alignments to export' }, { status: 404 });
  }

  const alignments = alignmentsData as unknown as ExportAlignment[];

  // Filter out any invalid alignments
  const validAlignments = alignments.filter(
    a => a && a.card_concepts && a.slide_concepts && a.card_concepts.card_id
  );

  if (validAlignments.length === 0) {
    return NextResponse.json({ error: 'No valid alignments to export' }, { status: 404 });
  }

  // Extract unique card IDs
  const cardIds = Array.from(new Set(
    validAlignments.map(a => a.card_concepts.card_id)
  ));

  // For tag and word export, we need to get the front text from raw_cards
  let rawCardsMap = new Map<string, string>();
  if ((format === 'tag' || format === 'word') && validAlignments.length > 0) {
    const deckId = validAlignments[0].card_concepts.deck_id;
    
    // Get front text for all card_ids (prefer front_raw for exact Anki matching)
    const { data: rawCardsData } = await supabase
      .from('raw_cards')
      .select('card_id, front, front_raw')
      .eq('deck_id', deckId)
      .in('card_id', cardIds);
    
    if (rawCardsData) {
      for (const rc of rawCardsData as RawCard[]) {
        // Use front_raw if available (for exact Anki matching), otherwise fall back to front
        rawCardsMap.set(rc.card_id, rc.front_raw || rc.front);
      }
    }
  }

  if (format === 'txt') {
    // Simple text format with just card IDs
    return NextResponse.json({
      cardIds,
      count: cardIds.length,
      suggestedTag: `Ankify::${lecture.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
    });
  }

  if (format === 'cid') {
    // Anki cid: search format - paste directly into Anki browser
    const cidSearch = `cid:${cardIds.join(',')}`;
    return NextResponse.json({
      cidSearch,
      count: cardIds.length,
      suggestedTag: `Ankify::${lecture.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
    });
  }

  if (format === 'tag') {
    // Tag export format: text;tag (semicolon-delimited for Anki import)
    const tag = customTag || `Ankify::${lecture.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
    
    // Escape function for semicolon-delimited CSV
    const escapeField = (value: string) => {
      // If field contains semicolons, newlines, or quotes, wrap in quotes and escape quotes
      if (value.includes(';') || value.includes('\n') || value.includes('"')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const csvRows = ['Text;Tags']; // Header matching Anki field names
    const seenTexts = new Set<string>();

    for (const cardId of cardIds) {
      const frontText = rawCardsMap.get(cardId);
      if (frontText && !seenTexts.has(frontText)) {
        seenTexts.add(frontText);
        csvRows.push(`${escapeField(frontText)};${escapeField(tag)}`);
      }
    }

    return NextResponse.json({
      csv: csvRows.join('\n'),
      count: seenTexts.size,
      tag,
    });
  }

  if (format === 'word') {
    // Word export format: one Word document with all slides
    // Group alignments by slide number
    const alignmentsBySlide = new Map<number, ExportAlignment[]>();
    
    for (const alignment of validAlignments) {
      const slideNum = alignment.slide_concepts.slide_number;
      if (!alignmentsBySlide.has(slideNum)) {
        alignmentsBySlide.set(slideNum, []);
      }
      alignmentsBySlide.get(slideNum)!.push(alignment);
    }

    const lectureNameSafe = lecture.name.replace(/[^a-zA-Z0-9]/g, '_');
    const allChildren: (Paragraph | Table)[] = [];

    // Add document title
    allChildren.push(
      new Paragraph({
        text: lecture.name,
        heading: HeadingLevel.TITLE,
        spacing: { after: 400 },
      })
    );

    // Get all unique card IDs across all slides for summary section
    const allCardIds = Array.from(new Set(validAlignments.map(a => a.card_concepts.card_id)));
    const allCidSearchQuery = `cid:${allCardIds.join(',')}`;
    const allOrSearchQuery = allCardIds.map(id => `cid:${id}`).join(' OR ');

    // Add summary section at the top with all cards
    allChildren.push(
      new Paragraph({
        text: 'Summary - All Cards',
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 400 },
      }),
      new Paragraph({
        text: `Total Cards: ${allCardIds.length}`,
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 200 },
      }),
      new Paragraph({
        text: 'Card ID Search (Copy to Anki Browser):',
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 200 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: 'CID Format: ',
            bold: true,
          }),
          new TextRun({
            text: allCidSearchQuery,
            font: 'Courier New',
            highlight: 'yellow',
          }),
        ],
        spacing: { after: 200 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: 'OR Format: ',
            bold: true,
          }),
          new TextRun({
            text: allOrSearchQuery,
            font: 'Courier New',
            highlight: 'yellow',
          }),
        ],
        spacing: { after: 400 },
      })
    );

    // Create summary table with all cards
    const summaryTableRows: TableRow[] = [
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: 'Card ID', bold: true })] })],
            width: { size: 20, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: 'Slide', bold: true })] })],
            width: { size: 10, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: 'Alignment Type', bold: true })] })],
            width: { size: 20, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: 'Similarity Score', bold: true })] })],
            width: { size: 15, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: 'Card Front', bold: true })] })],
            width: { size: 25, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: 'Tags', bold: true })] })],
            width: { size: 10, type: WidthType.PERCENTAGE },
          }),
        ],
      }),
    ];

    // Add all cards to summary table (sorted by slide number, then by alignment type)
    const sortedAlignmentsForSummary = [...validAlignments].sort((a, b) => {
      if (a.slide_concepts.slide_number !== b.slide_concepts.slide_number) {
        return a.slide_concepts.slide_number - b.slide_concepts.slide_number;
      }
      if (a.alignment_type === 'directly_aligned' && b.alignment_type !== 'directly_aligned') return -1;
      if (a.alignment_type !== 'directly_aligned' && b.alignment_type === 'directly_aligned') return 1;
      return b.similarity_score - a.similarity_score;
    });

    for (const alignment of sortedAlignmentsForSummary) {
      const cardFront = rawCardsMap.get(alignment.card_concepts.card_id) || alignment.card_concepts.concept_summary || 'N/A';
      const tags = (alignment.card_concepts.tags || []).join(', ') || 'None';
      
      summaryTableRows.push(
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ 
                children: [new TextRun({ text: alignment.card_concepts.card_id, font: 'Courier New' })],
              })],
            }),
            new TableCell({
              children: [new Paragraph({ 
                text: alignment.slide_concepts.slide_number.toString(),
              })],
            }),
            new TableCell({
              children: [new Paragraph({ 
                text: alignment.alignment_type.replace(/_/g, ' ').toUpperCase(),
              })],
            }),
            new TableCell({
              children: [new Paragraph({ 
                text: alignment.similarity_score.toFixed(3),
              })],
            }),
            new TableCell({
              children: [new Paragraph({ 
                text: cardFront.length > 100 ? cardFront.substring(0, 100) + '...' : cardFront,
              })],
            }),
            new TableCell({
              children: [new Paragraph({ text: tags })],
            }),
          ],
        })
      );
    }

    allChildren.push(
      new Table({
        rows: summaryTableRows,
        width: { size: 100, type: WidthType.PERCENTAGE },
      }),
      // Page break before slides
      new Paragraph({
        text: '',
        pageBreakBefore: true,
      })
    );

    // Sort slides by slide number
    const sortedSlides = Array.from(alignmentsBySlide.entries()).sort((a, b) => a[0] - b[0]);

    // Create content for each slide
    for (const [slideNumber, slideAlignments] of sortedSlides) {
      // Sort alignments by alignment type (directly_aligned first) then by similarity score
      slideAlignments.sort((a, b) => {
        if (a.alignment_type === 'directly_aligned' && b.alignment_type !== 'directly_aligned') return -1;
        if (a.alignment_type !== 'directly_aligned' && b.alignment_type === 'directly_aligned') return 1;
        return b.similarity_score - a.similarity_score;
      });

      const slideConcept = slideAlignments[0].slide_concepts.concept_summary;
      
      // Get card IDs for this slide
      const slideCardIds = Array.from(new Set(slideAlignments.map(a => a.card_concepts.card_id)));
      
      // Create card ID search query (copyable format)
      const cidSearchQuery = `cid:${slideCardIds.join(',')}`;
      const orSearchQuery = slideCardIds.map(id => `cid:${id}`).join(' OR ');

      // Add page break before each slide
      allChildren.push(
        new Paragraph({
          text: '',
          pageBreakBefore: true,
        })
      );

      // Build slide content
      allChildren.push(
        // Slide Title
        new Paragraph({
          text: `Slide ${slideNumber}`,
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 400 },
        }),
        
        // Slide Concept Summary
        new Paragraph({
          text: 'Slide Concept:',
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 200 },
        }),
        new Paragraph({
          text: slideConcept,
          spacing: { after: 400 },
        }),

        // Card ID Search Section
        new Paragraph({
          text: 'Card ID Search (Copy to Anki Browser):',
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'CID Format: ',
              bold: true,
            }),
            new TextRun({
              text: cidSearchQuery,
              font: 'Courier New',
              highlight: 'yellow',
            }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'OR Format: ',
              bold: true,
            }),
            new TextRun({
              text: orSearchQuery,
              font: 'Courier New',
              highlight: 'yellow',
            }),
          ],
          spacing: { after: 400 },
        }),

        // Alignment Details Section
        new Paragraph({
          text: `Aligned Cards (${slideAlignments.length}):`,
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 200 },
        })
      );

      // Create table with card details
      const tableRows: TableRow[] = [
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Card ID', bold: true })] })],
              width: { size: 20, type: WidthType.PERCENTAGE },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Alignment Type', bold: true })] })],
              width: { size: 20, type: WidthType.PERCENTAGE },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Similarity Score', bold: true })] })],
              width: { size: 15, type: WidthType.PERCENTAGE },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Card Front', bold: true })] })],
              width: { size: 25, type: WidthType.PERCENTAGE },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Tags', bold: true })] })],
              width: { size: 20, type: WidthType.PERCENTAGE },
            }),
          ],
        }),
      ];

      for (const alignment of slideAlignments) {
        const cardFront = rawCardsMap.get(alignment.card_concepts.card_id) || alignment.card_concepts.concept_summary || 'N/A';
        const tags = (alignment.card_concepts.tags || []).join(', ') || 'None';
        
        tableRows.push(
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ 
                  children: [new TextRun({ text: alignment.card_concepts.card_id, font: 'Courier New' })],
                })],
              }),
              new TableCell({
                children: [new Paragraph({ 
                  text: alignment.alignment_type.replace(/_/g, ' ').toUpperCase(),
                })],
              }),
              new TableCell({
                children: [new Paragraph({ 
                  text: alignment.similarity_score.toFixed(3),
                })],
              }),
              new TableCell({
                children: [new Paragraph({ 
                  text: cardFront.length > 100 ? cardFront.substring(0, 100) + '...' : cardFront,
                })],
              }),
              new TableCell({
                children: [new Paragraph({ text: tags })],
              }),
            ],
          })
        );
      }

      allChildren.push(
        new Table({
          rows: tableRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
        })
      );

      // Add reasoning section
      const directlyAligned = slideAlignments.filter(a => a.alignment_type === 'directly_aligned');
      if (directlyAligned.length > 0 && directlyAligned[0].llm_reasoning) {
        allChildren.push(
          new Paragraph({
            text: 'AI Reasoning:',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 },
          }),
          new Paragraph({
            text: directlyAligned[0].llm_reasoning,
            spacing: { after: 400 },
          })
        );
      }
    }

    // Create single Word document with all slides
    const doc = new Document({
      sections: [{
        children: allChildren,
      }],
    });

    // Generate document buffer
    const docBuffer = await Packer.toBuffer(doc);
    
    // Return as downloadable file
    return new NextResponse(docBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${lectureNameSafe}_slides.docx"`,
      },
    });
  }

  // CSV format with full details
  const csvRows = [
    ['card_id', 'slide_number', 'alignment_type', 'similarity_score', 'card_concept', 'slide_concept', 'reasoning', 'tags'].join(','),
  ];

  for (const alignment of validAlignments) {
    csvRows.push([
      alignment.card_concepts.card_id || '',
      alignment.slide_concepts.slide_number.toString(),
      alignment.alignment_type,
      alignment.similarity_score.toFixed(3),
      `"${(alignment.card_concepts.concept_summary || '').replace(/"/g, '""')}"`,
      `"${(alignment.slide_concepts.concept_summary || '').replace(/"/g, '""')}"`,
      `"${(alignment.llm_reasoning || '').replace(/"/g, '""')}"`,
      `"${(alignment.card_concepts.tags || []).join(';')}"`,
    ].join(','));
  }

  return NextResponse.json({
    csv: csvRows.join('\n'),
    cardIds,
    count: cardIds.length,
    suggestedTag: `Ankify::${lecture.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
  });
}
