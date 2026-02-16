'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button, Modal, Input } from '@/components/ui';
import { Trash2, Loader2 } from 'lucide-react';

interface DeleteAccountButtonProps {
  userId: string;
}

export function DeleteAccountButton({ userId }: DeleteAccountButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') {
      setError('Please type DELETE to confirm');
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const supabase = createClient();

      // Delete user data via API
      const response = await fetch('/api/user/delete', {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete account');
      }

      // Sign out
      await supabase.auth.signOut();
      
      // Redirect to home
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setDeleting(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowModal(true)}
        className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
      >
        <Trash2 className="mr-2 h-4 w-4 stroke-[3px]" />
        DELETE ACCOUNT
      </Button>

      <Modal
        isOpen={showModal}
        onClose={() => !deleting && setShowModal(false)}
        title="DELETE ACCOUNT"
      >
        <div className="space-y-4">
          <div className="p-4 bg-red-500 border-4 border-black shadow-neo-sm">
            <p className="text-sm font-black uppercase text-white">
              ⚠️ WARNING: THIS ACTION CANNOT BE UNDONE
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-bold">
              This will permanently delete:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm font-bold ml-2">
              <li>All your decks and card data</li>
              <li>All your lectures and slide data</li>
              <li>All your card alignments</li>
              <li>Your account and profile</li>
            </ul>
          </div>

          {error && (
            <div className="p-4 bg-red-500 border-4 border-black shadow-neo-sm">
              <p className="text-sm font-black uppercase text-white">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="confirm" className="block text-sm font-bold uppercase tracking-widest mb-2">
              TYPE &quot;DELETE&quot; TO CONFIRM
            </label>
            <Input
              id="confirm"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              disabled={deleting}
              autoComplete="off"
            />
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowModal(false)}
              disabled={deleting}
              className="flex-1"
            >
              CANCEL
            </Button>
            <Button
              variant="primary"
              onClick={handleDelete}
              disabled={confirmText !== 'DELETE' || deleting}
              className="flex-1 bg-red-500 hover:bg-red-600"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 stroke-[3px] animate-spin" />
                  DELETING...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4 stroke-[3px]" />
                  DELETE ACCOUNT
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
