'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, Button, Input } from '@/components/ui';
import { ArrowLeft, Upload, X, Loader2 } from 'lucide-react';

export default function UploadLecturePage() {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [uploading, setUploading] = useState(false);
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
    const validTypes = ['.pdf', '.pptx'];
    const ext = selectedFile.name.toLowerCase().slice(selectedFile.name.lastIndexOf('.'));

    if (!validTypes.includes(ext)) {
      setError('Please upload a PDF or PPTX file');
      return;
    }

    setFile(selectedFile);
    setError(null);

    // Auto-fill name from filename if empty
    setName((currentName) => {
      if (!currentName) {
        return selectedFile.name.replace(/\.(pdf|pptx)$/i, '');
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

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', name.trim());

      const response = await fetch('/api/lectures', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to upload lecture');
      }

      const { lecture } = await response.json();
      router.push(`/lectures/${lecture.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <Link href="/lectures">
        <Button variant="ghost" size="sm" className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4 stroke-[3px]" />
          BACK TO LECTURES
        </Button>
      </Link>

      <h1 className="text-4xl sm:text-5xl md:text-6xl font-black uppercase tracking-tighter mb-8">
        UPLOAD LECTURE
      </h1>

      <Card className="p-6 sm:p-8 shadow-neo-xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Card className="p-4 bg-neo-accent border-4 border-black shadow-neo-md">
              <p className="text-sm font-black uppercase text-white">
                {error}
              </p>
            </Card>
          )}

          <div>
            <label className="block text-sm font-black uppercase tracking-widest mb-3">
              LECTURE FILE
            </label>
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`
                border-4 border-dashed border-black p-8 sm:p-12 text-center transition-all duration-100
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
                    DRAG AND DROP YOUR LECTURE FILE HERE, OR{' '}
                    <label className="text-neo-accent underline decoration-4 underline-offset-4 cursor-pointer hover:bg-neo-secondary hover:px-2 hover:border-4 hover:border-black hover:shadow-neo-sm transition-all duration-100">
                      BROWSE
                      <input
                        type="file"
                        accept=".pdf,.pptx"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  </p>
                  <p className="text-sm font-bold uppercase tracking-widest mt-4">
                    SUPPORTED FORMATS: PDF, PPTX
                  </p>
                </div>
              )}
            </div>
          </div>

          <Input
            id="name"
            type="text"
            label="LECTURE NAME"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g., Cardiology Week 1"
          />

          <Card className="p-4 bg-neo-muted border-4 border-black">
            <h4 className="text-base font-black uppercase mb-3">WHAT HAPPENS NEXT?</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm font-bold">
              <li>We extract text from each slide</li>
              <li>AI generates concept summaries for each slide</li>
              <li>Embeddings are created for semantic search</li>
              <li>You can then align cards from your deck</li>
            </ol>
          </Card>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={!file || !name.trim() || uploading}
              className="flex-1 sm:flex-none"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 stroke-[3px] animate-spin" />
                  UPLOADING...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-5 w-5 stroke-[3px]" />
                  UPLOAD & PROCESS
                </>
              )}
            </Button>
            <Link href="/lectures">
              <Button variant="outline" size="lg">
                CANCEL
              </Button>
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
