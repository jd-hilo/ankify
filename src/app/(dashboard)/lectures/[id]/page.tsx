import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LectureActions } from '@/components/lecture-actions';
import { LectureProcessingProgress } from '@/components/LectureProcessingProgress';
import type { Lecture } from '@/types/database';
import { Card, Badge, Button } from '@/components/ui';
import { ArrowLeft, FileText, Calendar, CheckCircle, XCircle, Clock, ArrowRight } from 'lucide-react';

interface Props {
  params: Promise<{ id: string }>;
}

interface SlideConceptSummary {
  id: string;
  slide_number: number;
  concept_summary: string;
}

export default async function LectureDetailPage({ params }: Props) {
  const { id } = await params;
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

  function StatusBadge({ status }: { status: string }) {
    const variants: Record<string, { variant: 'accent' | 'secondary' | 'muted' | 'outline' }> = {
      completed: { variant: 'secondary' },
      processing: { variant: 'muted' },
      failed: { variant: 'accent' },
    };
    const config = variants[status] || { variant: 'outline' as const };
    return <Badge variant={config.variant} size="md">{status.toUpperCase()}</Badge>;
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

      <div className="grid gap-6 lg:grid-cols-4 mb-8">
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
            <CheckCircle className="h-8 w-8 stroke-black stroke-[3px]" />
            <h3 className="text-sm font-black uppercase tracking-widest">CARD ALIGNMENTS</h3>
          </div>
          <p className="text-4xl sm:text-5xl font-black mb-3">{alignmentCount || 0}</p>
          {isAlignmentProcessing && (
            <Link href={`/lectures/${id}/results`}>
              <Button variant="outline" size="sm" className="w-full">
                VIEW PROGRESS
                <ArrowRight className="ml-2 h-4 w-4 stroke-[3px]" />
              </Button>
            </Link>
          )}
          {lecture.processing_status === 'completed' && !isAlignmentProcessing && alignmentCount === 0 && (
            <Link href={`/lectures/${id}/align`}>
              <Button variant="primary" size="sm" className="w-full">
                GENERATE ALIGNMENTS
              </Button>
            </Link>
          )}
          {lecture.processing_status === 'completed' && !isAlignmentProcessing && (alignmentCount || 0) > 0 && (
            <Link href={`/lectures/${id}/results`}>
              <Button variant="primary" size="sm" className="w-full">
                VIEW RESULTS
                <ArrowRight className="ml-2 h-4 w-4 stroke-[3px]" />
              </Button>
            </Link>
          )}
        </Card>

        <Card className="p-6 -rotate-2">
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

      {slides && slides.length > 0 && (
        <Card className="shadow-neo-lg">
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
