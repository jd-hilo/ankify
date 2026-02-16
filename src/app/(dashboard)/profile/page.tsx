import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Card, Badge } from '@/components/ui';
import { User, Mail, Calendar, BookOpen, FileText, Trash2 } from 'lucide-react';
import { DeleteAccountButton } from '@/components/delete-account-button';

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch user stats
  const [
    { count: deckCount },
    { count: lectureCount },
    alignmentResult
  ] = await Promise.all([
    supabase.from('decks').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('lectures').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('card_alignments')
      .select('id, lectures!inner(user_id)', { count: 'exact', head: true })
      .eq('lectures.user_id', user.id)
  ]);

  const alignmentCount = alignmentResult.count;

  const joinedDate = new Date(user.created_at);

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-4xl sm:text-5xl md:text-6xl font-black uppercase tracking-tighter mb-8">
        PROFILE
      </h1>

      {/* User Info Card */}
      <Card className="p-6 sm:p-8 mb-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="bg-neo-accent border-4 border-black p-4 shadow-neo-sm">
            <User className="h-8 w-8 stroke-white stroke-[3px]" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-black uppercase mb-2">ACCOUNT INFO</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 stroke-[3px]" />
                <span className="text-base font-bold">{user.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 stroke-[3px]" />
                <span className="text-sm font-bold uppercase tracking-widest">
                  JOINED {joinedDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-3 mb-6">
        <Card className="p-6 text-center">
          <div className="bg-neo-secondary border-4 border-black p-4 inline-block mb-4 shadow-neo-sm">
            <BookOpen className="h-8 w-8 stroke-black stroke-[3px]" />
          </div>
          <div className="text-4xl font-black mb-2">{deckCount || 0}</div>
          <div className="text-sm font-bold uppercase tracking-widest text-neo-muted">
            DECKS UPLOADED
          </div>
        </Card>

        <Card className="p-6 text-center">
          <div className="bg-neo-accent border-4 border-black p-4 inline-block mb-4 shadow-neo-sm">
            <FileText className="h-8 w-8 stroke-white stroke-[3px]" />
          </div>
          <div className="text-4xl font-black mb-2">{lectureCount || 0}</div>
          <div className="text-sm font-bold uppercase tracking-widest text-neo-muted">
            LECTURES UPLOADED
          </div>
        </Card>

        <Card className="p-6 text-center">
          <div className="bg-neo-secondary border-4 border-black p-4 inline-block mb-4 shadow-neo-sm rotate-3">
            <span className="text-2xl font-black">✓</span>
          </div>
          <div className="text-4xl font-black mb-2">{alignmentCount || 0}</div>
          <div className="text-sm font-bold uppercase tracking-widest text-neo-muted">
            CARDS MATCHED
          </div>
        </Card>
      </div>

      {/* Danger Zone */}
      <Card className="p-6 sm:p-8 border-red-500">
        <div className="flex items-start gap-4">
          <div className="bg-red-500 border-4 border-black p-3 shadow-neo-sm">
            <Trash2 className="h-6 w-6 stroke-white stroke-[3px]" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-black uppercase mb-2 text-red-500">
              DANGER ZONE
            </h3>
            <p className="text-sm font-bold mb-4">
              Permanently delete your account and all associated data. This action cannot be undone.
            </p>
            <DeleteAccountButton userId={user.id} />
          </div>
        </div>
      </Card>
    </div>
  );
}
