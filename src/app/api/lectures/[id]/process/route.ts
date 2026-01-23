import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parsePdf } from '@/lib/parsers/pdf';
import { parsePptx } from '@/lib/parsers/pptx';
import {
  openai,
  generateEmbedding,
  generateEmbeddingsBatch,
} from '@/lib/openai';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get the lecture
  const { data: lecture, error: lectureError } = await supabase
    .from('lectures')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (lectureError || !lecture) {
    return NextResponse.json({ error: 'Lecture not found' }, { status: 404 });
  }

  if (lecture.processing_status === 'processing') {
    return NextResponse.json(
      { error: 'Lecture is already being processed' },
      { status: 400 }
    );
  }

  // Update status to processing
  await supabase
    .from('lectures')
    .update({ processing_status: 'processing', error_message: null })
    .eq('id', id);

  // Create processing job
  await supabase.from('processing_jobs').insert({
    user_id: user.id,
    job_type: 'lecture_processing',
    target_id: id,
    status: 'processing',
    progress: 0,
    started_at: new Date().toISOString(),
  });

  // Start processing in background
  processLectureInBackground(id, user.id, supabase);

  return NextResponse.json({
    message: 'Processing started',
    status: 'processing',
  });
}

async function processLectureInBackground(
  lectureId: string,
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  try {
    // Get lecture info
    const { data: lecture } = await supabase
      .from('lectures')
      .select('*')
      .eq('id', lectureId)
      .single();

    if (!lecture) {
      throw new Error('Lecture not found');
    }

    // Find the uploaded file in storage
    const { data: files } = await supabase.storage
      .from('uploads')
      .list(`${userId}/lectures`);

    // Find the file for this lecture (most recent one)
    const lectureFile = files?.find((f) =>
      f.name.endsWith(lecture.file_type === 'pdf' ? '.pdf' : '.pptx')
    );

    if (!lectureFile) {
      throw new Error('Uploaded file not found');
    }

    const storagePath = `${userId}/lectures/${lectureFile.name}`;

    // Download the file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('uploads')
      .download(storagePath);

    if (downloadError || !fileData) {
      throw new Error('Failed to download file');
    }

    // Update progress: Parsing file
    await supabase
      .from('processing_jobs')
      .update({ progress: 10 })
      .eq('target_id', lectureId)
      .eq('job_type', 'lecture_processing');

    // Parse the lecture
    let slides: { slideNumber: number; content: string }[];

    const buffer = Buffer.from(await fileData.arrayBuffer());

    if (lecture.file_type === 'pdf') {
      const parsed = await parsePdf(buffer);
      slides = parsed.slides;
    } else {
      const parsed = await parsePptx(buffer);
      slides = parsed.slides;
    }

    // Update lecture with slide count
    await supabase
      .from('lectures')
      .update({ slide_count: slides.length })
      .eq('id', lectureId);

    // Update progress: File parsed
    await supabase
      .from('processing_jobs')
      .update({ progress: 20 })
      .eq('target_id', lectureId)
      .eq('job_type', 'lecture_processing');

    // Generate concept summaries for each slide
    console.log(`Generating concept summaries for ${slides.length} slides...`);
    const conceptSummaries = await generateSlideConceptsBatch(
      slides,
      lectureId,
      supabase
    );

    // Update progress: Concepts generated
    await supabase
      .from('processing_jobs')
      .update({ progress: 70 })
      .eq('target_id', lectureId)
      .eq('job_type', 'lecture_processing');

    // Generate embeddings for all summaries
    console.log(`Generating embeddings for ${conceptSummaries.length} concepts...`);
    const embeddings = await generateEmbeddingsBatch(
      conceptSummaries,
      async (completed, total) => {
        console.log(`Embeddings: ${completed}/${total}`);
        const progress = 70 + Math.floor((completed / total) * 20);
        await supabase
          .from('processing_jobs')
          .update({ progress })
          .eq('target_id', lectureId)
          .eq('job_type', 'lecture_processing');
      }
    );

    // Insert slide concepts
    const slideConceptsData = slides.map((slide, idx) => ({
      lecture_id: lectureId,
      slide_number: slide.slideNumber,
      concept_summary: conceptSummaries[idx],
      embedding: embeddings[idx],
    }));

    const { error: insertError } = await supabase
      .from('slide_concepts')
      .insert(slideConceptsData);

    if (insertError) {
      throw new Error(`Failed to save slide concepts: ${insertError.message}`);
    }

    // Delete the uploaded file (we no longer need it)
    await supabase.storage.from('uploads').remove([storagePath]);

    // Mark as completed
    await supabase
      .from('lectures')
      .update({ processing_status: 'completed' })
      .eq('id', lectureId);

    await supabase
      .from('processing_jobs')
      .update({
        status: 'completed',
        progress: 100,
        completed_at: new Date().toISOString(),
      })
      .eq('target_id', lectureId)
      .eq('job_type', 'lecture_processing');

    console.log(`Lecture ${lectureId} processing completed successfully`);
  } catch (error) {
    console.error('Lecture processing error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Mark as failed
    await supabase
      .from('lectures')
      .update({
        processing_status: 'failed',
        error_message: errorMessage,
      })
      .eq('id', lectureId);

    await supabase
      .from('processing_jobs')
      .update({
        status: 'failed',
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq('target_id', lectureId)
      .eq('job_type', 'lecture_processing');
  }
}

/**
 * Generate concept summaries for slides in batches
 */
async function generateSlideConceptsBatch(
  slides: { slideNumber: number; content: string }[],
  lectureId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string[]> {
  const BATCH_SIZE = 20;
  const results: string[] = [];

  for (let i = 0; i < slides.length; i += BATCH_SIZE) {
    const batch = slides.slice(i, i + BATCH_SIZE);
    let batchResults: string[] = [];

    try {
      const payload = batch.map((slide) => ({
        content: slide.content.slice(0, 1200),
      }));

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a medical education expert. For each slide, generate a concise concept summary (1-2 sentences) that captures the main medical concept or learning objective.

Requirements:
- Focus on the core medical concept being presented
- Be specific but concise
- Use appropriate medical terminology
- If the slide appears to be a title slide or contains no educational content, summarize what section/topic is being introduced

Return a JSON object with a "summaries" array in the same order as the input list.`,
          },
          {
            role: 'user',
            content: JSON.stringify({ slides: payload }),
          },
        ],
        temperature: 0,
        max_tokens: 1600,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(content) as { summaries?: string[] };

      if (Array.isArray(parsed.summaries) && parsed.summaries.length === batch.length) {
        batchResults = parsed.summaries.map((summary) =>
          summary?.trim() || 'Content could not be summarized'
        );
      } else {
        batchResults = await Promise.all(
          batch.map((slide) => generateSlideConcept(slide.content))
        );
      }
    } catch (error) {
      console.warn('Batch summary failed, falling back to single summaries', error);
      batchResults = await Promise.all(
        batch.map((slide) => generateSlideConcept(slide.content))
      );
    }

    results.push(...batchResults);

    // Update progress (20% to 70% range for concept generation)
    const progress = 20 + Math.floor(((i + batch.length) / slides.length) * 50);
    await supabase
      .from('processing_jobs')
      .update({ progress })
      .eq('target_id', lectureId)
      .eq('job_type', 'lecture_processing');

    console.log(`Generated concepts for ${i + batch.length}/${slides.length} slides`);

    // Rate limiting
    if (i + BATCH_SIZE < slides.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
}

/**
 * Generate a concept summary for a slide
 */
async function generateSlideConcept(slideContent: string): Promise<string> {
  if (!slideContent || !slideContent.trim()) {
    return 'No educational content';
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a medical education expert. Given the text content from a lecture slide, generate a concise concept summary (1-2 sentences) that captures the main medical concept or learning objective being taught.

Requirements:
- Focus on the core medical concept being presented
- Be specific but concise
- Use appropriate medical terminology
- If the slide appears to be a title slide or contains no educational content, summarize what section/topic is being introduced

Output only the concept summary, nothing else.`,
      },
      {
        role: 'user',
        content: slideContent.slice(0, 2000), // Limit content length
      },
    ],
    temperature: 0,
    max_tokens: 150,
  });

  return response.choices[0]?.message?.content?.trim() || 'Content could not be summarized';
}
