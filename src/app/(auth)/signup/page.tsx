'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button, Input, Card } from '@/components/ui';
import { ArrowRight, CheckCircle } from 'lucide-react';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    const supabase = createClient();

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-neo-bg bg-dots relative">
        <div className="w-full max-w-md relative z-10">
          <Card className="p-8 sm:p-12 shadow-neo-xl text-center">
            <div className="mb-6 inline-block">
              <div className="bg-neo-secondary border-4 border-black p-6 shadow-neo-md rotate-3">
                <CheckCircle className="h-16 w-16 stroke-black stroke-[4px] fill-neo-secondary" />
              </div>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tighter mb-4">
              CHECK YOUR EMAIL
            </h2>
            <p className="text-lg font-bold mb-8 leading-relaxed">
              We&apos;ve sent you a confirmation link. Please check your email to verify your account.
            </p>
            <Link href="/login">
              <Button variant="outline" size="lg">
                BACK TO LOGIN
                <ArrowRight className="ml-2 h-5 w-5 stroke-[3px]" />
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-neo-bg bg-grid relative">
      {/* Decorative elements */}
      <div className="absolute top-10 right-10 -rotate-12 opacity-10">
        <div className="w-32 h-32 bg-neo-secondary border-4 border-black shadow-neo-lg"></div>
      </div>
      <div className="absolute bottom-10 left-10 rotate-6 opacity-10">
        <div className="w-24 h-24 bg-neo-muted border-4 border-black shadow-neo-md"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        <Card className="p-8 sm:p-12 shadow-neo-xl">
          <div className="text-center mb-8">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black uppercase tracking-tighter mb-4">
              CREATE ACCOUNT
            </h1>
            <p className="text-xl font-bold">
              START ALIGNING YOUR{' '}
              <span className="bg-neo-accent text-white px-2 border-4 border-black shadow-neo-sm inline-block rotate-1">
                CURRICULUM
              </span>{' '}
              TODAY
            </p>
          </div>

          <form onSubmit={handleSignup} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-500 border-4 border-red-700 shadow-neo-md">
                <p className="text-sm font-black uppercase text-white tracking-widest">
                  {error}
                </p>
              </div>
            )}

            <Input
              id="email"
              type="email"
              label="EMAIL"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
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

            <Input
              id="confirmPassword"
              type="password"
              label="CONFIRM PASSWORD"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
              {loading ? 'CREATING ACCOUNT...' : (
                <>
                  CREATE ACCOUNT
                  <ArrowRight className="ml-2 h-5 w-5 stroke-[3px]" />
                </>
              )}
            </Button>
          </form>

          <p className="mt-8 text-center text-base font-bold">
            ALREADY HAVE AN ACCOUNT?{' '}
            <Link 
              href="/login" 
              className="text-neo-accent underline decoration-4 underline-offset-4 hover:bg-neo-secondary hover:px-2 hover:border-4 hover:border-black hover:shadow-neo-sm transition-all duration-100"
            >
              SIGN IN
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
