import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { AlignmentType } from '@/types/database';

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

  // For tag export, we need to get the front text from raw_cards
  let rawCardsMap = new Map<string, string>();
  if (format === 'tag' && validAlignments.length > 0) {
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
