'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, Button, Input, Badge, Modal } from '@/components/ui';
import { Upload, FileText, Calendar, X, Loader2 } from 'lucide-react';
import type { Lecture } from '@/types/database';

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

interface LecturesWithUploadProps {
  initialLectures: Lecture[];
  error: string | null;
}

export function LecturesWithUpload({ initialLectures, error: initialError }: LecturesWithUploadProps) {
  const [lectures, setLectures] = useState<Lecture[]>(initialLectures);
  const [showUploadModal, setShowUploadModal] = useState(false);
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

  const handleCloseModal = () => {
    if (!uploading) {
      setShowUploadModal(false);
      setFile(null);
      setName('');
      setError(null);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black uppercase tracking-tighter">
          LECTURES
        </h1>
        <Button variant="primary" size="lg" onClick={() => setShowUploadModal(true)}>
          <Upload className="mr-2 h-5 w-5 stroke-[3px]" />
          UPLOAD LECTURE
        </Button>
      </div>

      {initialError ? (
        <Card className="p-6 bg-neo-accent border-4 border-black shadow-neo-md">
          <p className="text-base font-black uppercase text-white">
            FAILED TO LOAD LECTURES: {initialError}
          </p>
        </Card>
      ) : lectures.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {lectures.map((lecture, idx) => (
            <Link 
              key={lecture.id}
              href={`/lectures/${lecture.id}`}
              className="block"
            >
              <Card 
                hover 
                className={`p-6 ${idx % 3 === 0 ? '-rotate-1' : idx % 3 === 1 ? 'rotate-1' : '-rotate-2'}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="bg-neo-secondary border-4 border-black p-3 shadow-neo-sm">
                    <FileText className="h-6 w-6 stroke-black stroke-[3px]" />
                  </div>
                  <StatusBadge status={lecture.processing_status} />
                </div>
                
                <h3 className="text-xl font-black uppercase mb-3 hover:text-neo-accent transition-colors duration-100">
                  {lecture.name}
                </h3>
                
                <div className="space-y-2 border-t-4 border-black pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold uppercase tracking-widest">TYPE</span>
                    <Badge variant="outline" size="sm">
                      {lecture.file_type.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold uppercase tracking-widest">SLIDES</span>
                    <span className="text-lg font-black">{lecture.slide_count}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold uppercase tracking-widest flex items-center gap-1">
                      <Calendar className="h-4 w-4 stroke-[3px]" />
                      CREATED
                    </span>
                    <span className="text-sm font-bold">
                      {new Date(lecture.created_at).toLocaleDateString()}
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
            <div className="bg-neo-accent border-4 border-black p-8 shadow-neo-lg -rotate-3">
              <FileText className="h-16 w-16 stroke-white stroke-[4px]" />
            </div>
          </div>
          <p className="text-xl font-black uppercase mb-6">
            YOU HAVEN&apos;T UPLOADED ANY LECTURES YET
          </p>
          <Link href="/lectures/upload">
            <Button variant="primary" size="lg">
              UPLOAD YOUR FIRST LECTURE
            </Button>
          </Link>
        </Card>
      )}
    </div>
  );
}