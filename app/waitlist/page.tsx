"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function WaitlistPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    async function checkSession() {
      if (!supabase) return;
      
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user?.email) {
        setEmail(session.user.email);
      }
      setLoading(false);
    }

    checkSession();
  }, [supabase]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white/60">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <div className="text-6xl mb-8">🦸</div>
        
        <h1 className="text-3xl font-bold text-white mb-4">
          You&apos;re on the list!
        </h1>
        
        <p className="text-white/60 mb-8">
          {email ? (
            <>Thanks, we&apos;ll email <span className="text-white font-medium">{email}</span> when you&apos;re in.</>
          ) : (
            <>Thanks for signing up! We&apos;ll reach out when you&apos;re in.</>
          )}
        </p>

        <div className="space-y-4">
          <Link
            href="/"
            className="block w-full py-3 px-4 bg-white text-black font-medium rounded-lg hover:bg-white/90 transition"
          >
            Back to home
          </Link>

          <button
            onClick={async () => {
              if (supabase) {
                await supabase.auth.signOut();
              }
              window.location.href = "/";
            }}
            className="block w-full py-3 px-4 border border-white/20 text-white/60 rounded-lg hover:bg-white/5 transition"
          >
            Sign out
          </button>
        </div>

        <p className="text-white/40 text-sm mt-12">
          Friday AI — Coming soon
        </p>
      </div>
    </div>
  );
}
