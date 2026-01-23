import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ExportButton } from '@/components/export-button';
import { RegenerateAlignmentsButton } from '@/components/regenerate-alignments-button';
import { AlignmentFilters } from '@/components/alignment-filters';
import { AlignmentProcessingProgress } from '@/components/AlignmentProcessingProgress';
import { SlideExportButton } from '@/components/slide-export-button';
import type { Lecture, AlignmentType } from '@/types/database';
import { Card, Badge, Button } from '@/components/ui';
import { ArrowLeft, FileText, CheckCircle, AlertCircle, XCircle, Info } from 'lucide-react';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string }>;
}

interface AlignmentWithRelations {
  id: string;
  alignment_type: AlignmentType;
  similarity_score: number;
  llm_reasoning: string;
  slide_concepts: { slide_number: number; concept_summary: string };
  card_concepts: { card_id: string; concept_summary: string; tags: string[] | null };
}

interface GapWithRelations {
  id: string;
  gap_description: string;
  slide_concepts: { slide_number: number; concept_summary: string };
}

interface AlignmentCount {
  alignment_type: AlignmentType;
}

export default async function ResultsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { filter } = await searchParams;
  const supabase = await createClient();

  // Get lecture
  const { data: lectureData, error: lectureError } = await supabase
    .from('lectures')
    .select('*')
    .eq('id', id)
    .single();

  if (lectureError || !lectureData) {
    return (
      <div className="max-w-2xl">
        <Link href="/lectures">
          <Button variant="ghost" size="sm" className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4 stroke-[3px]" />
            BACK TO LECTURES
          </Button>
        </Link>
        <Card className="p-6 bg-neo-accent border-4 border-black shadow-neo-md">
          <h1 className="text-xl font-black uppercase mb-2 text-white">LECTURE NOT FOUND</h1>
          <p className="text-sm font-bold text-white">
            This lecture may have been deleted or you don&apos;t have access to it.
          </p>
        </Card>
      </div>
    );
  }

  const lecture = lectureData as Lecture;

  // Check if alignment is currently processing
  const { data: jobData } = await supabase
    .from('processing_jobs')
    .select('*')
    .eq('target_id', id)
    .eq('job_type', 'alignment_generation')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const isProcessing = jobData?.status === 'processing';

  // If processing, show progress component
  if (isProcessing) {
    return (
      <div>
        <Link href={`/lectures/${id}`}>
          <Button variant="ghost" size="sm" className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4 stroke-[3px]" />
            BACK TO LECTURE
          </Button>
        </Link>

        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tighter">ALIGNMENT RESULTS</h1>
            <p className="text-lg font-bold mt-2">
              {lecture.name}
            </p>
          </div>
        </div>

        <AlignmentProcessingProgress lectureId={id} />
      </div>
    );
  }

  // Get alignments with related data
  let alignmentsQuery = supabase
    .from('card_alignments')
    .select(`
      *,
      slide_concepts!inner(slide_number, concept_summary),
      card_concepts!inner(card_id, concept_summary, tags)
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

  // Count by alignment type
  const { data: countDataRaw } = await supabase
    .from('card_alignments')
    .select('alignment_type')
    .eq('lecture_id', id);

  const countData = (countDataRaw || []) as AlignmentCount[];

  const counts = {
    all: countData.length,
    directly_aligned: countData.filter(a => a.alignment_type === 'directly_aligned').length,
    deeper_than_lecture: countData.filter(a => a.alignment_type === 'deeper_than_lecture').length,
    too_shallow: countData.filter(a => a.alignment_type === 'too_shallow').length,
    not_aligned: countData.filter(a => a.alignment_type === 'not_aligned').length,
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
      <Link href={`/lectures/${id}`}>
        <Button variant="ghost" size="sm" className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4 stroke-[3px]" />
          BACK TO LECTURE
        </Button>
      </Link>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tighter">ALIGNMENT RESULTS</h1>
          <p className="text-lg font-bold mt-2">
            {lecture.name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {alignments.length > 0 && (
            <RegenerateAlignmentsButton lectureId={id} />
          )}
          <ExportButton lectureId={id} lectureName={lecture.name} />
        </div>
      </div>

      {/* Filters */}
      <AlignmentFilters currentFilter={filter || 'all'} counts={counts} />

      {/* Alignments by slide */}
      {alignments.length > 0 ? (
        <div className="space-y-6">
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
                    <SlideExportButton 
                      alignments={slideAlignments}
                      slideNumber={slideNum}
                    />
                  </div>
                </div>
                <div className="divide-y-4 divide-black">
                  {slideAlignments.map((alignment) => (
                      <div key={alignment.id} className="px-6 py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="text-base font-bold leading-relaxed mb-2">{alignment.card_concepts.concept_summary}</p>
                            <p className="text-xs font-bold uppercase tracking-widest mb-2 opacity-60">
                              CARD ID: {alignment.card_concepts.card_id}
                            </p>
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
      ) : (
        <Card className="p-12 text-center shadow-neo-xl">
          <p className="text-lg font-black uppercase mb-6">
            NO ALIGNMENTS FOUND{filter && filter !== 'all' ? ` FOR "${filter.replace(/_/g, ' ').toUpperCase()}"` : ''}
          </p>
          {!filter || filter === 'all' ? (
            <Link href={`/lectures/${id}/align`}>
              <Button variant="primary" size="lg">
                GENERATE ALIGNMENTS
              </Button>
            </Link>
          ) : null}
        </Card>
      )}

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
  );
}
