import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '../../../../lib/supabase/server';

/**
 * Magic-link and email-confirmation landing. Exchanges the one-time code for a session,
 * then sends the user where they were originally headed.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next');

  // Same-origin only — ?next= is attacker-controllable via a forwarded link.
  const destination = next?.startsWith('/') && !next.startsWith('//') ? next : '/home';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=link_expired`);
}
