'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button, Input, Card } from '@/components/ui';
import { ArrowRight } from 'lucide-react';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/dashboard';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(redirect);
    router.refresh();
  };

  return (
    <form onSubmit={handleLogin} className="space-y-6">
      {error && (
        <Card className="p-4 bg-neo-accent border-4 border-black shadow-neo-md">
          <p className="text-sm font-black uppercase text-white tracking-widest">
            {error}
          </p>
        </Card>
      )}

      <Input
        id="email"
        type="email"
        label="EMAIL"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        placeholder="you@example.com"
        error={error ? undefined : undefined}
      />

      <Input
        id="password"
        type="password"
        label="PASSWORD"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        placeholder="••••••••"
      />

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={loading}
        className="w-full"
      >
        {loading ? 'SIGNING IN...' : (
          <>
            SIGN IN
            <ArrowRight className="ml-2 h-5 w-5 stroke-[3px]" />
          </>
        )}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-neo-bg bg-grid relative">
      {/* Decorative elements */}
      <div className="absolute top-10 left-10 rotate-12 opacity-10">
        <div className="w-32 h-32 bg-neo-accent border-4 border-black shadow-neo-lg"></div>
      </div>
      <div className="absolute bottom-10 right-10 -rotate-6 opacity-10">
        <div className="w-24 h-24 bg-neo-secondary border-4 border-black shadow-neo-md"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        <Card className="p-8 sm:p-12 shadow-neo-xl">
          <div className="text-center mb-8">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black uppercase tracking-tighter mb-4">
              SIGN IN
            </h1>
            <p className="text-xl font-bold">
              ALIGN YOUR LECTURES WITH{' '}
              <span className="bg-neo-secondary px-2 border-4 border-black shadow-neo-sm inline-block rotate-[-1deg]">
                ANKING
              </span>{' '}
              CARDS
            </p>
          </div>

          <Suspense fallback={
            <div className="text-center font-bold uppercase">LOADING...</div>
          }>
            <LoginForm />
          </Suspense>

          <p className="mt-8 text-center text-base font-bold">
            DON&apos;T HAVE AN ACCOUNT?{' '}
            <Link 
              href="/signup" 
              className="text-neo-accent underline decoration-4 underline-offset-4 hover:bg-neo-secondary hover:px-2 hover:border-4 hover:border-black hover:shadow-neo-sm transition-all duration-100"
            >
              SIGN UP
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
