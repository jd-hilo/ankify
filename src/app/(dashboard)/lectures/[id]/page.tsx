import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LectureActions } from '@/components/lecture-actions';
import { LectureProcessingProgress } from '@/components/LectureProcessingProgress';
import { ExportButton } from '@/components/export-button';
import { RegenerateAlignmentsButton } from '@/components/regenerate-alignments-button';
import { AlignmentFilters } from '@/components/alignment-filters';
import { AlignmentProcessingProgress } from '@/components/AlignmentProcessingProgress';
import type { Lecture, AlignmentType } from '@/types/database';
import { Card, Badge, Button } from '@/components/ui';
import { ArrowLeft, FileText, Calendar, CheckCircle, XCircle, Clock, ArrowRight } from 'lucide-react';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string }>;
}

interface SlideConceptSummary {
  id: string;
  slide_number: number;
  concept_summary: string;
}

interface AlignmentWithRelations {
  id: string;
  alignment_type: AlignmentType;
  similarity_score: number;
  llm_reasoning: string;
  slide_concepts: { slide_number: number; concept_summary: string };
  card_concepts: { card_id: string; concept_summary: string; tags: string[] | null } | null;
}

interface GapWithRelations {
  id: string;
  gap_description: string;
  slide_concepts: { slide_number: number; concept_summary: string };
}

interface AlignmentCount {
  alignment_type: AlignmentType;
}

export default async function LectureDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { filter } = await searchParams;
  const supabase = await createClient();

  const { data: lectureData, error } = await supabase
    .from('lectures')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !lectureData) {
    notFound();
  }

  const lecture = lectureData as Lecture;

  // Get slide concepts if lecture is processed
  const { data: slidesData } = lecture.processing_status === 'completed'
    ? await supabase
        .from('slide_concepts')
        .select('id, slide_number, concept_summary')
        .eq('lecture_id', id)
        .order('slide_number', { ascending: true })
    : { data: null };

  const slides = (slidesData || null) as SlideConceptSummary[] | null;

  // Check if there are any alignments for this lecture
  const { count: alignmentCount } = await supabase
    .from('card_alignments')
    .select('*', { count: 'exact', head: true })
    .eq('lecture_id', id);

  // Check if alignment is currently processing
  const { data: alignmentJob } = await supabase
    .from('processing_jobs')
    .select('*')
    .eq('target_id', id)
    .eq('job_type', 'alignment_generation')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const isAlignmentProcessing = alignmentJob?.status === 'processing';

  // Get alignments with related data
  let alignmentsQuery = supabase
    .from('card_alignments')
    .select(`
      *,
      slide_concepts!inner(slide_number, concept_summary),
      card_concepts(card_id, concept_summary, tags)
    `)
    .eq('lecture_id', id)
    .order('created_at', { ascending: true });

  // Apply filter if specified
  if (filter && filter !== 'all') {
    alignmentsQuery = alignmentsQuery.eq('alignment_type', filter);
  }

  const { data: alignmentsData } = await alignmentsQuery;
  const alignments = (alignmentsData || []) as AlignmentWithRelations[];

  // Get coverage gaps
  const { data: gapsData } = await supabase
    .from('coverage_gaps')
    .select(`
      *,
      slide_concepts!inner(slide_number, concept_summary)
    `)
    .eq('lecture_id', id);

  const gaps = (gapsData || []) as GapWithRelations[];

  // Count by alignment type - deduplicate by card_id
  const { data: countDataRaw } = await supabase
    .from('card_alignments')
    .select('alignment_type, card_concepts(card_id)')
    .eq('lecture_id', id);

  const countData = (countDataRaw || []) as unknown as Array<{ alignment_type: AlignmentType; card_concepts: { card_id: string } | null }>;

  // Deduplicate by card_id for each alignment type
  const uniqueCardsByType = {
    all: new Set(countData.filter(a => a.card_concepts).map(a => a.card_concepts!.card_id)),
    directly_aligned: new Set(countData.filter(a => a.alignment_type === 'directly_aligned' && a.card_concepts).map(a => a.card_concepts!.card_id)),
    deeper_than_lecture: new Set(countData.filter(a => a.alignment_type === 'deeper_than_lecture' && a.card_concepts).map(a => a.card_concepts!.card_id)),
    too_shallow: new Set(countData.filter(a => a.alignment_type === 'too_shallow' && a.card_concepts).map(a => a.card_concepts!.card_id)),
    not_aligned: new Set(countData.filter(a => a.alignment_type === 'not_aligned' && a.card_concepts).map(a => a.card_concepts!.card_id)),
  };

  const counts = {
    all: uniqueCardsByType.all.size,
    directly_aligned: uniqueCardsByType.directly_aligned.size,
    deeper_than_lecture: uniqueCardsByType.deeper_than_lecture.size,
    too_shallow: uniqueCardsByType.too_shallow.size,
    not_aligned: uniqueCardsByType.not_aligned.size,
  };

  // Group alignments by slide
  const alignmentsBySlide = new Map<number, AlignmentWithRelations[]>();
  alignments.forEach(a => {
    const slideNum = a.slide_concepts.slide_number;
    if (!alignmentsBySlide.has(slideNum)) {
      alignmentsBySlide.set(slideNum, []);
    }
    alignmentsBySlide.get(slideNum)!.push(a);
  });

  function StatusBadge({ status }: { status: string }) {
    const variants: Record<string, { variant: 'accent' | 'secondary' | 'muted' | 'outline' }> = {
      completed: { variant: 'secondary' },
      processing: { variant: 'muted' },
      failed: { variant: 'accent' },
    };
    const config = variants[status] || { variant: 'outline' as const };
    return <Badge variant={config.variant} size="md">{status.toUpperCase()}</Badge>;
  }

  function AlignmentTypeBadge({ type }: { type: AlignmentType }) {
    const variants: Record<AlignmentType, { variant: 'accent' | 'secondary' | 'muted' | 'outline' }> = {
      directly_aligned: { variant: 'secondary' },
      deeper_than_lecture: { variant: 'muted' },
      too_shallow: { variant: 'accent' },
      not_aligned: { variant: 'outline' },
    };
    const config = variants[type];
    return (
      <Badge variant={config.variant} size="sm">
        {type.replace(/_/g, ' ').toUpperCase()}
      </Badge>
    );
  }

  return (
    <div>
      <Link href="/lectures">
        <Button variant="ghost" size="sm" className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4 stroke-[3px]" />
          BACK TO LECTURES
        </Button>
      </Link>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black uppercase tracking-tighter mb-2">
            {lecture.name}
          </h1>
          <p className="text-lg font-bold">
            {lecture.file_type.toUpperCase()} &middot; {lecture.slide_count} SLIDES
          </p>
        </div>
        <LectureActions lecture={lecture} hasAlignments={(alignmentCount || 0) > 0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3 mb-8">
        <Card className="p-6 rotate-1">
          <div className="flex items-center gap-3 mb-4">
            {lecture.processing_status === 'completed' && (
              <CheckCircle className="h-8 w-8 stroke-neo-secondary stroke-[3px]" />
            )}
            {lecture.processing_status === 'failed' && (
              <XCircle className="h-8 w-8 stroke-neo-accent stroke-[3px]" />
            )}
            {(lecture.processing_status === 'processing' || lecture.processing_status === 'pending') && (
              <Clock className="h-8 w-8 stroke-neo-muted stroke-[3px]" />
            )}
            <h3 className="text-sm font-black uppercase tracking-widest">STATUS</h3>
          </div>
          <StatusBadge status={lecture.processing_status} />
          {lecture.error_message && (
            <Card className="mt-4 p-3 bg-neo-accent border-4 border-black">
              <p className="text-sm font-black uppercase text-white">
                {lecture.error_message}
              </p>
            </Card>
          )}
        </Card>

        <Card className="p-6 -rotate-1">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="h-8 w-8 stroke-black stroke-[3px]" />
            <h3 className="text-sm font-black uppercase tracking-widest">SLIDES</h3>
          </div>
          <p className="text-4xl sm:text-5xl font-black">{lecture.slide_count}</p>
        </Card>

        <Card className="p-6 rotate-2">
          <div className="flex items-center gap-3 mb-4">
            <Calendar className="h-8 w-8 stroke-black stroke-[3px]" />
            <h3 className="text-sm font-black uppercase tracking-widest">CREATED</h3>
          </div>
          <p className="text-lg font-bold">
            {new Date(lecture.created_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }).toUpperCase()}
          </p>
        </Card>
      </div>

      {lecture.processing_status === 'pending' && (
        <Card className="p-6 mb-8 bg-neo-secondary border-4 border-black shadow-neo-md">
          <h3 className="text-lg font-black uppercase mb-2">
            PROCESSING REQUIRED
          </h3>
          <p className="text-base font-bold">
            This lecture has been uploaded but not yet processed. Click the button above to start processing.
          </p>
        </Card>
      )}

      {lecture.processing_status === 'processing' && (
        <div className="mb-8">
          <LectureProcessingProgress lectureId={id} />
        </div>
      )}

      {/* Show alignment processing progress if currently processing */}
      {isAlignmentProcessing && (
        <div className="mb-8">
          <h2 className="text-3xl font-black uppercase tracking-tighter mb-6">MATCHING PROGRESS</h2>
          <AlignmentProcessingProgress lectureId={id} />
        </div>
      )}

      {/* Show alignment results if they exist */}
      {alignments.length > 0 && (
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <h2 className="text-3xl font-black uppercase tracking-tighter">CARD MATCHES</h2>
            <div className="flex flex-wrap gap-2">
              <RegenerateAlignmentsButton lectureId={id} />
              <ExportButton lectureId={id} lectureName={lecture.name} />
            </div>
          </div>

          {/* Filters */}
          <AlignmentFilters currentFilter={filter || 'all'} counts={counts} />

          {/* Alignments by slide */}
          <div className="space-y-6 mt-6">
            {Array.from(alignmentsBySlide.entries())
              .sort(([a], [b]) => a - b)
              .map(([slideNum, slideAlignments], idx) => (
                <Card key={slideNum} className={`shadow-neo-lg ${idx % 2 === 0 ? 'rotate-1' : '-rotate-1'}`}>
                  <div className="px-6 py-4 border-b-4 border-black bg-neo-muted">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-12 h-12 bg-neo-accent border-4 border-black flex items-center justify-center text-lg font-black text-white shadow-neo-sm">
                        {slideNum}
                      </div>
                      <p className="text-base font-bold flex-1 leading-relaxed">
                        {slideAlignments[0]?.slide_concepts.concept_summary}
                      </p>
                    </div>
                  </div>
                  <div className="divide-y-4 divide-black">
                    {slideAlignments.map((alignment) => (
                      <div key={alignment.id} className="px-6 py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            {alignment.card_concepts ? (
                              <>
                                <p className="text-base font-bold leading-relaxed mb-2">{alignment.card_concepts.concept_summary}</p>
                                <p className="text-xs font-bold uppercase tracking-widest mb-2 opacity-60">
                                  CARD ID: {alignment.card_concepts.card_id}
                                </p>
                              </>
                            ) : (
                              <p className="text-base font-bold leading-relaxed mb-2 text-red-600">
                                Card details not available (RLS restriction - please run migration 007)
                              </p>
                            )}
                            <Card className="p-3 bg-neo-secondary border-4 border-black mt-3">
                              <p className="text-xs font-bold italic">
                                {alignment.llm_reasoning}
                              </p>
                            </Card>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <AlignmentTypeBadge type={alignment.alignment_type} />
                            <Badge variant="outline" size="sm">
                              {Math.round(alignment.similarity_score * 100)}% SIMILARITY
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
          </div>

          {/* Coverage Gaps */}
          {gaps.length > 0 && (
            <div className="mt-12">
              <h2 className="text-3xl font-black uppercase tracking-tighter mb-6">COVERAGE GAPS</h2>
              <Card className="bg-neo-accent border-4 border-black shadow-neo-lg">
                <div className="divide-y-4 divide-black">
                  {gaps.map((gap) => (
                    <div key={gap.id} className="px-6 py-4">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-10 h-10 bg-white border-4 border-black flex items-center justify-center text-sm font-black shadow-neo-sm">
                          {gap.slide_concepts.slide_number}
                        </div>
                        <div className="flex-1">
                          <p className="text-base font-black uppercase text-white mb-2">{gap.gap_description}</p>
                          <p className="text-sm font-bold text-white/90">
                            SLIDE CONCEPT: {gap.slide_concepts.concept_summary}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {slides && slides.length > 0 && alignments.length === 0 && !isAlignmentProcessing && (
        <Card className="shadow-neo-lg mb-8">
          <div className="px-6 py-4 border-b-4 border-black bg-neo-muted">
            <h2 className="text-xl font-black uppercase tracking-tight">SLIDE CONCEPTS</h2>
            <p className="text-sm font-bold mt-1">
              EXTRACTED CONCEPTS FROM {slides.length} SLIDES
            </p>
          </div>
          <div className="divide-y-4 divide-black">
            {slides.map((slide) => (
              <div key={slide.id} className="px-6 py-4">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 bg-neo-accent border-4 border-black flex items-center justify-center text-lg font-black text-white shadow-neo-sm">
                    {slide.slide_number}
                  </div>
                  <p className="text-base font-bold flex-1 leading-relaxed">{slide.concept_summary}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
