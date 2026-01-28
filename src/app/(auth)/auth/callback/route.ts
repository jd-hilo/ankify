import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const { searchParams, origin } = requestUrl;
  const code = searchParams.get('code');
  const token = searchParams.get('token');
  const type = searchParams.get('type'); // 'signup', 'recovery', 'email', etc.
  const next = searchParams.get('next') ?? '/dashboard';

  const supabase = await createClient();

  // Handle email confirmation with code (PKCE flow - most common)
  if (code) {
    try {
      const { error, data } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && data.session) {
        // Successfully verified - redirect to dashboard
        return NextResponse.redirect(`${origin}/dashboard`);
      }
      // If there's an error, log it and redirect with error message
      console.error('Auth callback error:', error);
      const errorMessage = error?.message || 'Email confirmation failed';
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorMessage)}`);
    } catch (err) {
      console.error('Unexpected error in auth callback:', err);
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('An unexpected error occurred during email confirmation')}`);
    }
  }

  // Handle token-based confirmation (older Supabase flows or magic link)
  if (token) {
    try {
      // Try OTP verification for signup
      if (type === 'signup' || type === 'email') {
        const { error, data } = await supabase.auth.verifyOtp({
          token_hash: token,
          type: type === 'signup' ? 'signup' : 'email',
        });
        if (!error && data.session) {
          return NextResponse.redirect(`${origin}/dashboard`);
        }
        console.error('Token verification error:', error);
        const errorMessage = error?.message || 'Token verification failed';
        return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorMessage)}`);
      }

      // Handle password recovery
      if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/login?token=${token}&type=recovery`);
      }
    } catch (err) {
      console.error('Token verification error:', err);
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('Token verification failed')}`);
    }
  }

  // Check if user is already authenticated (might have been auto-confirmed)
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // User is already authenticated, redirect to dashboard
      return NextResponse.redirect(`${origin}/dashboard`);
    }
  } catch (err) {
    // Ignore errors checking user
  }

  // No valid code or token found
  console.warn('Auth callback called without code or token:', requestUrl.toString());
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('Invalid confirmation link. Please check your email for the correct link or request a new one.')}`);
}
