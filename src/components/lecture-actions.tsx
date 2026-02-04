'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Lecture } from '@/types/database';
import { Button } from '@/components/ui';
import { RefreshCw, ArrowRight, Play, Trash2, Loader2 } from 'lucide-react';

interface LectureActionsProps {
  lecture: Lecture;
  hasAlignments: boolean;
}

export function LectureActions({ lecture, hasAlignments }: LectureActionsProps) {
  const [processing, setProcessing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const router = useRouter();

  const handleProcess = async () => {
    setProcessing(true);
    try {
      const response = await fetch(`/api/lectures/${lecture.id}/process`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start processing');
      }

      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to process lecture');
    } finally {
      setProcessing(false);
    }
  };

  const handleRegenerateAlignments = async () => {
    if (!confirm('Are you sure you want to regenerate alignments? This will delete all existing matches and create new ones.')) {
      return;
    }

    setRegenerating(true);
    try {
      const response = await fetch(`/api/alignments/${lecture.id}/regenerate`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to regenerate alignments');
      }

      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to regenerate alignments');
      setRegenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this lecture? This action cannot be undone.')) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch(`/api/lectures/${lecture.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete lecture');
      }

      router.push('/lectures');
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete lecture');
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {lecture.processing_status === 'completed' && (
        <>
          {hasAlignments ? (
            <Button
              variant="secondary"
              onClick={handleRegenerateAlignments}
              disabled={regenerating}
            >
              {regenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 stroke-[3px] animate-spin" />
                  REGENERATING...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 stroke-[3px]" />
                  RE-MATCH CARDS
                </>
              )}
            </Button>
          ) : (
            <Link href={`/lectures/${lecture.id}/align`}>
              <Button variant="primary">
                MATCH CARDS
                <ArrowRight className="ml-2 h-4 w-4 stroke-[3px]" />
              </Button>
            </Link>
          )}
        </>
      )}
      {lecture.processing_status === 'pending' && (
        <Button
          variant="primary"
          onClick={handleProcess}
          disabled={processing}
        >
          {processing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 stroke-[3px] animate-spin" />
              STARTING...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4 stroke-[3px]" />
              PROCESS LECTURE
            </>
          )}
        </Button>
      )}
      {lecture.processing_status === 'failed' && (
        <Button
          variant="secondary"
          onClick={handleProcess}
          disabled={processing}
        >
          {processing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 stroke-[3px] animate-spin" />
              RETRYING...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4 stroke-[3px]" />
              RETRY PROCESSING
            </>
          )}
        </Button>
      )}
      <Button
        variant="outline"
        onClick={handleDelete}
        disabled={deleting || lecture.processing_status === 'processing'}
        className="border-neo-accent text-neo-accent hover:bg-neo-accent hover:text-white"
      >
        {deleting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 stroke-[3px] animate-spin" />
            DELETING...
          </>
        ) : (
          <>
            <Trash2 className="mr-2 h-4 w-4 stroke-[3px]" />
            DELETE
          </>
        )}
      </Button>
    </div>
  );
}
