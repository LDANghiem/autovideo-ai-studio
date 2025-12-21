"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      alert("Enter email and password.");
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      // 1) Immediately check what Supabase returned
      console.log("SIGNIN RESULT session:", data.session);

      // 2) Confirm it’s actually persisted (this is the key test)
      const { data: sessionCheck } = await supabase.auth.getSession();
      console.log("SESSION AFTER SIGNIN:", sessionCheck.session);

      if (!sessionCheck.session?.access_token) {
        throw new Error(
          "Signed in, but no session was persisted. This usually means the app is using a different Supabase project/keys, or the client is not the shared singleton."
        );
      }

      // Good: navigate
      router.replace("/dashboard/create");
      router.refresh(); // helps App Router re-render with new auth state
    } catch (err: any) {
      console.error("LOGIN ERROR:", err);
      alert(err?.message ? err.message : JSON.stringify(err, null, 2));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md border rounded-xl p-6 bg-white shadow">
        <h1 className="text-xl font-bold mb-4">Sign In</h1>

        <label className="block text-sm font-medium mb-1">Email</label>
        <input
          className="w-full border rounded-lg px-3 py-2 mb-3"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          type="email"
          autoComplete="email"
        />

        <label className="block text-sm font-medium mb-1">Password</label>
        <input
          className="w-full border rounded-lg px-3 py-2 mb-4"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          type="password"
          autoComplete="current-password"
        />

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full py-3 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-60"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </div>
    </div>
  );
}
