'use client';

import { useState } from 'react';
import { Button, Card, Modal } from '@/components/ui';
import { Copy, Loader2, Check } from 'lucide-react';

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
      setShowOptions(false);
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
            COPYING...
          </>
        ) : (
          <>
            <Copy className="mr-2 h-4 w-4 stroke-[3px]" />
            COPY DIRECTLY ALIGNED IDS
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
                  'COPY CID: SEARCH - DIRECTLY MATCHED'
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
                  DOWNLOAD WORD FILE - DIRECTLY MATCHED
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('word')}
                  className="w-full justify-start"
                  disabled={exporting}
                >
                  DOWNLOAD WORD FILE - ALL MATCHES
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Copy success modal */}
      <Modal
        isOpen={copied}
        onClose={() => setCopied(false)}
        title="COPIED TO CLIPBOARD"
      >
        <div className="p-4">
          <p className="text-base font-bold mb-6">
            Card IDs have been copied to your clipboard!
          </p>
          
          <div className="space-y-4 mb-6">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-neo-accent border-2 border-black flex items-center justify-center text-sm font-black text-white">
                1
              </div>
              <p className="text-sm font-bold flex-1">
                Go to your AnKing deck in Anki
              </p>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-neo-accent border-2 border-black flex items-center justify-center text-sm font-black text-white">
                2
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold mb-2">
                  Paste the IDs in the search bar
                </p>
                <img 
                  src="/assets/demo.png" 
                  alt="Anki search bar demo" 
                  className="w-full border-4 border-black shadow-neo-sm"
                />
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-neo-accent border-2 border-black flex items-center justify-center text-sm font-black text-white">
                3
              </div>
              <p className="text-sm font-bold flex-1">
                View and study each card for this lecture
              </p>
            </div>
          </div>
          
          <Button
            variant="primary"
            onClick={() => setCopied(false)}
            className="w-full"
          >
            GOT IT
          </Button>
        </div>
      </Modal>
    </div>
  );
}
