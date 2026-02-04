'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import DeckProcessingProgress from '@/components/DeckProcessingProgress';
import { createClient } from '@/lib/supabase/client';
import { Card, Button, Input, Badge, Modal } from '@/components/ui';
import { BookOpen, Calendar, Upload, X, Loader2 } from 'lucide-react';
import type { Deck } from '@/types/database';

type UploadState = 'idle' | 'uploading' | 'processing' | 'completed' | 'error';

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { variant: 'accent' | 'secondary' | 'muted' | 'outline' }> = {
    completed: { variant: 'secondary' },
    processing: { variant: 'muted' },
    failed: { variant: 'accent' },
  };

  const config = variants[status] || { variant: 'outline' as const };

  return (
    <Badge variant={config.variant} size="sm">
      {status.toUpperCase()}
    </Badge>
  );
}

interface DecksWithUploadProps {
  initialDecks: Deck[];
  error: string | null;
}

export function DecksWithUpload({ initialDecks, error: initialError }: DecksWithUploadProps) {
  const [decks, setDecks] = useState<Deck[]>(initialDecks);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deckId, setDeckId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const router = useRouter();

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const validateAndSetFile = useCallback((selectedFile: File) => {
    const validTypes = ['.apkg', '.csv', '.txt'];
    const ext = selectedFile.name.toLowerCase().slice(selectedFile.name.lastIndexOf('.'));

    if (!validTypes.includes(ext)) {
      setError('Please upload an APKG, CSV, or TXT file');
      return;
    }

    setFile(selectedFile);
    setError(null);

    // Auto-fill name from filename if empty
    setName((currentName) => {
      if (!currentName) {
        return selectedFile.name.replace(/\.(apkg|csv|txt)$/i, '');
      }
      return currentName;
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndSetFile(droppedFile);
    }
  }, [validateAndSetFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name.trim()) return;

    setUploadState('uploading');
    setUploadProgress(0);
    setError(null);

    try {
      const supabase = createClient();

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Please log in to upload a deck');
      }

      // Determine file type
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      const fileType = ext === '.apkg' ? 'apkg' : 'csv';

      // Generate unique storage path
      const storagePath = `${user.id}/${crypto.randomUUID()}_${file.name}`;

      // Step 1: Upload directly to Supabase Storage with progress tracking
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

      const { data: session } = await supabase.auth.getSession();
      const accessToken = session?.session?.access_token || supabaseKey;

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(percent);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            try {
              const errorData = JSON.parse(xhr.responseText);
              reject(new Error(errorData.message || errorData.error || 'Upload failed'));
            } catch {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });

        xhr.open('POST', `${supabaseUrl}/storage/v1/object/uploads/${storagePath}`);
        xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
        xhr.setRequestHeader('x-upsert', 'false');
        xhr.send(file);
      });

      // Step 2: Register the deck via API
      const registerResponse = await fetch('/api/decks/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          storagePath,
          fileType,
          fileSize: file.size,
        }),
      });

      if (!registerResponse.ok) {
        const data = await registerResponse.json();
        throw new Error(data.error || 'Failed to register deck');
      }

      const { deck } = await registerResponse.json();
      setDeckId(deck.id);

      // Step 3: Start processing
      setUploadState('processing');
      const processResponse = await fetch(`/api/decks/${deck.id}/process`, {
        method: 'POST',
      });

      if (!processResponse.ok) {
        const data = await processResponse.json();
        throw new Error(data.error || 'Failed to start processing');
      }

      // Processing started - the progress component will track from here
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setUploadState('error');
    }
  };

  const handleProcessingComplete = () => {
    setUploadState('completed');
    // Redirect after a short delay so user can see the success message
    setTimeout(() => {
      if (deckId) {
        router.push(`/decks/${deckId}`);
      }
    }, 1500);
  };

  const handleProcessingError = (errorMessage: string) => {
    setError(errorMessage);
    setUploadState('error');
  };

  const handleCloseModal = () => {
    if (uploadState !== 'uploading' && uploadState !== 'processing') {
      setShowUploadModal(false);
      setFile(null);
      setName('');
      setError(null);
      setUploadState('idle');
      setUploadProgress(0);
    }
  };

  // Show progress view when processing
  if (uploadState === 'processing' || uploadState === 'completed') {
    return (
      <Modal
        isOpen={true}
        onClose={() => {}}
        title={uploadState === 'completed' ? 'UPLOAD COMPLETE!' : 'PROCESSING DECK...'}
      >
        <div className="p-4">
          {deckId && (
            <DeckProcessingProgress
              deckId={deckId}
              onComplete={handleProcessingComplete}
              onError={handleProcessingError}
            />
          )}

          <Card className="mt-6 p-4 bg-neo-secondary border-4 border-black">
            <p className="text-sm font-bold">
              Processing is fast because we&apos;re only extracting cards - no AI processing happens yet.
              AI will be used later when you align cards with a lecture.
            </p>
          </Card>
        </div>
      </Modal>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black uppercase tracking-tighter">
          DECKS
        </h1>
        <Button variant="primary" size="lg" onClick={() => setShowUploadModal(true)}>
          <Upload className="mr-2 h-5 w-5 stroke-[3px]" />
          UPLOAD DECK
        </Button>
      </div>

      {initialError ? (
        <Card className="p-6 bg-neo-accent border-4 border-black shadow-neo-md">
          <p className="text-base font-black uppercase text-white">
            FAILED TO LOAD DECKS: {initialError}
          </p>
        </Card>
      ) : decks.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {decks.map((deck, idx) => (
            <Link 
              key={deck.id}
              href={`/decks/${deck.id}`}
              className="block"
            >
              <Card 
                hover 
                className={`p-6 ${idx % 3 === 0 ? 'rotate-1' : idx % 3 === 1 ? '-rotate-1' : 'rotate-2'}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="bg-neo-accent border-4 border-black p-3 shadow-neo-sm">
                    <BookOpen className="h-6 w-6 stroke-white stroke-[3px]" />
                  </div>
                  <StatusBadge status={deck.processing_status} />
                </div>
                
                <h3 className="text-xl font-black uppercase mb-3 hover:text-neo-accent transition-colors duration-100">
                  {deck.name}
                </h3>
                
                <div className="space-y-2 border-t-4 border-black pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold uppercase tracking-widest">TYPE</span>
                    <Badge variant="outline" size="sm">
                      {deck.file_type.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold uppercase tracking-widest">CARDS</span>
                    <span className="text-lg font-black">{deck.card_count.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold uppercase tracking-widest flex items-center gap-1">
                      <Calendar className="h-4 w-4 stroke-[3px]" />
                      CREATED
                    </span>
                    <span className="text-sm font-bold">
                      {new Date(deck.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="p-12 sm:p-16 text-center shadow-neo-xl">
          <div className="mb-6 inline-block">
            <div className="bg-neo-secondary border-4 border-black p-8 shadow-neo-lg rotate-3">
              <BookOpen className="h-16 w-16 stroke-black stroke-[4px]" />
            </div>
          </div>
          <p className="text-xl font-black uppercase mb-6">
            YOU HAVEN&apos;T UPLOADED ANY DECKS YET
          </p>
          <Button variant="primary" size="lg" onClick={() => setShowUploadModal(true)}>
            <Upload className="mr-2 h-5 w-5 stroke-[3px]" />
            UPLOAD YOUR FIRST DECK
          </Button>
        </Card>
      )}

      {/* Upload Modal */}
      <Modal
        isOpen={showUploadModal}
        onClose={handleCloseModal}
        title="UPLOAD DECK"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-4 bg-red-500 border-4 border-red-700 shadow-neo-md">
              <p className="text-sm font-black uppercase text-white">
                {error}
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-black uppercase tracking-widest mb-3">
              DECK FILE
            </label>
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`
                border-4 border-dashed border-black p-8 text-center transition-all duration-100
                ${dragActive
                  ? 'bg-neo-secondary shadow-neo-md'
                  : file
                  ? 'bg-neo-muted shadow-neo-sm'
                  : 'bg-white hover:bg-neo-secondary hover:shadow-neo-sm'
                }
              `}
            >
              {file ? (
                <div>
                  <p className="text-lg font-black uppercase mb-2">{file.name}</p>
                  <p className="text-sm font-bold mb-4">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFile(null)}
                  >
                    <X className="mr-2 h-4 w-4 stroke-[3px]" />
                    REMOVE
                  </Button>
                </div>
              ) : (
                <div>
                  <Upload className="h-12 w-12 stroke-black stroke-[4px] mx-auto mb-4" />
                  <p className="text-base font-bold mb-2">
                    DRAG AND DROP YOUR DECK FILE HERE, OR{' '}
                    <label className="text-neo-accent underline decoration-4 underline-offset-4 cursor-pointer hover:bg-neo-secondary hover:px-2 hover:border-4 hover:border-black hover:shadow-neo-sm transition-all duration-100">
                      BROWSE
                      <input
                        type="file"
                        accept=".apkg,.csv,.txt"
                        onChange={handleFileChange}
                        className="hidden"
                        disabled={uploadState === 'uploading'}
                      />
                    </label>
                  </p>
                  <p className="text-sm font-bold uppercase tracking-widest mt-4">
                    SUPPORTED FORMATS: APKG, CSV, TXT
                  </p>
                </div>
              )}
            </div>
          </div>

          <Input
            id="name"
            type="text"
            label="DECK NAME"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={uploadState === 'uploading'}
            placeholder="e.g., AnKing Step 1"
          />

          <Card className="p-4 bg-neo-muted border-4 border-black">
            <h4 className="text-base font-black uppercase mb-3">WHAT HAPPENS NEXT?</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm font-bold">
              <li>We extract card IDs and content from your deck</li>
              <li>Cards are indexed for fast text search</li>
              <li>Original file is deleted for privacy</li>
              <li className="text-neo-accent">
                AI processing happens only when you align with a lecture
              </li>
            </ol>
            <p className="mt-4 text-xs font-bold uppercase tracking-widest">
              This means uploads are fast and free - you only pay for AI when aligning cards to your lectures.
            </p>
          </Card>

          {/* Upload Progress Bar */}
          {uploadState === 'uploading' && (
            <Card className="p-4 bg-neo-secondary border-4 border-black shadow-neo-md">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Upload className="h-5 w-5 stroke-black stroke-[3px]" />
                  <span className="font-black uppercase">UPLOADING FILE...</span>
                </div>
                <span className="text-lg font-black">{uploadProgress}%</span>
              </div>
              <div className="h-4 bg-white border-4 border-black overflow-hidden">
                <div
                  className="h-full bg-neo-accent transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs font-bold uppercase mt-2">
                UPLOADING {file?.name} ({((file?.size || 0) / 1024 / 1024).toFixed(1)} MB)
              </p>
            </Card>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={!file || !name.trim() || uploadState === 'uploading'}
              className="flex-1"
            >
              {uploadState === 'uploading' ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 stroke-[3px] animate-spin" />
                  UPLOADING...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-5 w-5 stroke-[3px]" />
                  UPLOAD DECK
                </>
              )}
            </Button>
            <Button 
              type="button"
              variant="outline" 
              size="lg"
              onClick={handleCloseModal}
              disabled={uploadState === 'uploading'}
            >
              CANCEL
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
