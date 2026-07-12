"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { signInContractor } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }

    try {
      setBusy(true);
      await signInContractor(email.trim(), password);
      router.push("/");
    } catch (err) {
      console.error(err);
      setError("Invalid credentials, or this account is not a contractor account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="brand">
        <img src="/brand/logo-mark.png" alt="MC Construction" className="logo" />
        <div>
          <h1>MC Punch List</h1>
          <p>Contractor sign in</p>
        </div>
      </header>

      <section className="card stack">
        <div>
          <LogIn size={34} />
          <h2>Contractor login</h2>
          <p className="small">
            Customers never need to log in — they use the link shared for their project.
          </p>
        </div>

        <form className="stack" onSubmit={handleLogin}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@mcconstruction.com"
              autoComplete="email"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </label>

          {error && <div className="error">{error}</div>}

          <button className="btn btn-primary btn-wide" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
