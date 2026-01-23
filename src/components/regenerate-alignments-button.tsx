'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { RefreshCw, Loader2 } from 'lucide-react';

interface RegenerateAlignmentsButtonProps {
  lectureId: string;
}

export function RegenerateAlignmentsButton({ lectureId }: RegenerateAlignmentsButtonProps) {
  const [regenerating, setRegenerating] = useState(false);
  const router = useRouter();

  const handleRegenerate = async () => {
    if (!confirm('Are you sure you want to regenerate alignments? This will delete all existing matches and create new ones.')) {
      return;
    }

    setRegenerating(true);
    try {
      const response = await fetch(`/api/alignments/${lectureId}/regenerate`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to regenerate alignments');
      }

      // Refresh the page to show processing status
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to regenerate alignments');
      setRegenerating(false);
    }
  };

  return (
    <Button
      variant="secondary"
      onClick={handleRegenerate}
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
          REGENERATE ALIGNMENTS
        </>
      )}
    </Button>
  );
}
