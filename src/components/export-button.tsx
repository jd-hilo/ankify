'use client';

import { useState } from 'react';
import { Button, Card } from '@/components/ui';
import { Download, Loader2, Check } from 'lucide-react';

interface ExportButtonProps {
  lectureId: string;
  lectureName: string;
}

export function ExportButton({ lectureId, lectureName }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleExport = async (format: 'cid' | 'word', alignmentType?: string) => {
    setExporting(true);
    setCopied(false);
    try {
      const params = new URLSearchParams();
      params.set('format', format);
      if (alignmentType) params.set('alignmentType', alignmentType);

      const response = await fetch(`/api/alignments/${lectureId}/export?${params}`);

      if (!response.ok) {
        let errorMessage = 'Failed to export';
        try {
          const data = await response.json();
          errorMessage = data.error || errorMessage;
        } catch {
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Handle Word export (download file)
      if (format === 'word') {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${lectureName.replace(/[^a-zA-Z0-9]/g, '_')}_slides.docx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setShowOptions(false);
        return;
      }

      // Handle CID export (copy to clipboard)
      const data = await response.json();
      
      if (!data) {
        throw new Error('Empty response from server');
      }

      // Validate response data
      if (!data.cidSearch) {
        throw new Error('CID search not found in response');
      }

      // Copy to clipboard
      await navigator.clipboard.writeText(data.cidSearch);
      setCopied(true);
      setTimeout(() => {
        setShowOptions(false);
        setCopied(false);
      }, 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to export');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="relative">
      <Button
        variant="secondary"
        onClick={() => setShowOptions(!showOptions)}
        disabled={exporting}
      >
        {exporting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 stroke-[3px] animate-spin" />
            EXPORTING...
          </>
        ) : (
          <>
            <Download className="mr-2 h-4 w-4 stroke-[3px]" />
            EXPORT CARDS
          </>
        )}
      </Button>

      {showOptions && (
        <Card className="absolute right-0 mt-2 w-80 shadow-neo-xl z-10 border-4 border-black">
          <div className="p-4">
            <p className="text-xs font-black uppercase tracking-widest mb-3 px-2">ANKI SEARCH</p>
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('cid', 'directly_aligned')}
                className="w-full justify-start"
                disabled={exporting}
              >
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4 stroke-[3px]" />
                    COPIED!
                  </>
                ) : (
                  'COPY CID: SEARCH - DIRECTLY ALIGNED'
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('cid')}
                className="w-full justify-start"
                disabled={exporting}
              >
                COPY CID: SEARCH - ALL MATCHES
              </Button>
            </div>
            <div className="mt-4 pt-4 border-t-2 border-black">
              <p className="text-xs font-black uppercase tracking-widest mb-3 px-2">WORD EXPORT</p>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('word', 'directly_aligned')}
                  className="w-full justify-start"
                  disabled={exporting}
                >
                  DOWNLOAD WORD FILES - DIRECTLY ALIGNED
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('word')}
                  className="w-full justify-start"
                  disabled={exporting}
                >
                  DOWNLOAD WORD FILES - ALL MATCHES
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
