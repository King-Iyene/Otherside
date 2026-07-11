"use client";

import { Suspense, useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Step 2 — after the password is accepted, pick who you are.
  const [names, setNames] = useState<string[] | null>(null);
  const [role, setRole] = useState<string>("");
  const [name, setName] = useState("");

  async function handlePassword(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Login failed.");
        return;
      }
      const ns: string[] = Array.isArray(json.names) ? json.names : [];
      setRole(json.role || "");
      // If there is a name to choose, go to step 2; otherwise finish.
      if (ns.length > 1) {
        setNames(ns);
        setName(ns[0]);
      } else {
        finish(ns[0] || "");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function finish(who: string) {
    try {
      if (who) window.localStorage.setItem("otherside_name", who);
      if (role) window.localStorage.setItem("otherside_role", role);
    } catch {
      /* ignore */
    }
    router.push(searchParams.get("next") || "/");
    router.refresh();
  }

  return (
    <div className="login-screen">
      {names === null ? (
        <form className="login-card" onSubmit={handlePassword}>
          <div className="login-brand">OTHERSIDE</div>
          <div className="login-sub">Command Center</div>
          <input
            type="password"
            autoFocus
            placeholder="Your role password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="login-input"
          />
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? "Checking…" : "Enter"}
          </button>
        </form>
      ) : (
        <form
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault();
            finish(name);
          }}
        >
          <div className="login-brand">OTHERSIDE</div>
          <div className="login-sub">Who are you?</div>
          <select value={name} onChange={(e) => setName(e.target.value)} className="login-input" autoFocus>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button type="submit" className="login-btn">
            Continue
          </button>
        </form>
      )}
    </div>
  );
}
