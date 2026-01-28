'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface ProcessingJob {
  id: string;
  status: string;
  progress: number;
  error_message: string | null;
}

interface Props {
  lectureId: string;
}

export function AlignmentProcessingProgress({ lectureId }: Props) {
  const router = useRouter();
  const [job, setJob] = useState<ProcessingJob | null>(null);
  const [statusMessage, setStatusMessage] = useState('Initializing...');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const pollProgress = async () => {
      try {
        const response = await fetch(`/api/alignments/${lectureId}/progress`);
        if (response.ok) {
          const data = await response.json();
          setJob(data.job);

          // Update status message based on progress
          if (data.job.progress < 20) {
            setStatusMessage('Finding candidate cards...');
          } else if (data.job.progress < 60) {
            setStatusMessage('Processing slides...');
          } else if (data.job.progress < 90) {
            setStatusMessage('Creating embeddings...');
          } else if (data.job.progress < 100) {
            setStatusMessage('Matching cards to slides...');
          } else {
            setStatusMessage('Complete!');
          }

          // If completed or failed, stop polling and refresh
          if (data.job.status === 'completed' || data.job.status === 'failed') {
            clearInterval(intervalId);
            setTimeout(() => router.refresh(), 1000);
          }
        }
      } catch (error) {
        console.error('Failed to fetch progress:', error);
      }
    };

    // Poll every 2 seconds
    pollProgress();
    intervalId = setInterval(pollProgress, 2000);

    return () => clearInterval(intervalId);
  }, [lectureId, router]);

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel alignment generation? All progress will be lost.')) {
      return;
    }

    setCancelling(true);
    try {
      const response = await fetch(`/api/alignments/${lectureId}/cancel`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to cancel alignment');
      }

      // Refresh to show updated state
      router.refresh();
    } catch (error) {
      console.error('Cancel error:', error);
      alert('Failed to cancel alignment. Please try again.');
      setCancelling(false);
    }
  };

  if (!job) {
    return (
      <div className="space-y-4">
        <div className="bg-yellow-100 dark:bg-yellow-900/20 border-4 border-yellow-500 rounded-lg p-4">
          <p className="text-sm font-black uppercase text-yellow-900 dark:text-yellow-200">
            ⚠️ PLEASE STAY ON THIS PAGE WHILE PROCESSING (WE ARE FIXING THIS SOON)
          </p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <h3 className="font-medium text-blue-800 dark:text-blue-200">
            Generating Alignments
          </h3>
          <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
            Loading progress...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-yellow-100 dark:bg-yellow-900/20 border-4 border-yellow-500 rounded-lg p-4">
        <p className="text-sm font-black uppercase text-yellow-900 dark:text-yellow-200">
          ⚠️ PLEASE STAY ON THIS PAGE WHILE PROCESSING (WE ARE FIXING THIS SOON)
        </p>
      </div>
      
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
        <h3 className="font-medium text-blue-800 dark:text-blue-200">
          Generating Alignments
        </h3>
        <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
          {statusMessage}
        </p>
        
        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex justify-between text-sm text-blue-700 dark:text-blue-300 mb-1">
            <span>{job.progress}%</span>
          </div>
          <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2.5">
            <div
              className="bg-blue-600 dark:bg-blue-400 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>

        {job.error_message && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">
            Error: {job.error_message}
          </p>
        )}

        {/* Cancel button */}
        {job.status === 'processing' && (
          <div className="mt-4">
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {cancelling ? 'Cancelling...' : 'Cancel Alignment'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
