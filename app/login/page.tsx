"use client";

import { Suspense, useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";

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
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [names, setNames] = useState<string[] | null>(null);
  const [roleLabel, setRoleLabel] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [name, setName] = useState("");
  const [customName, setCustomName] = useState("");
  const [showCustom, setShowCustom] = useState(false);

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
      // Check if user previously saved a custom name for this role
      let savedCustom: string | null = null;
      try {
        savedCustom = window.localStorage.getItem(`otherside_custom_name_${json.role}`);
      } catch { /* ignore */ }
      const allNames = savedCustom && !ns.includes(savedCustom) ? [...ns, savedCustom] : ns;
      setRole(json.role || "");
      setRoleLabel(json.label || labelFor(json.role));
      setNames(allNames);
      setName(allNames[0] || "");
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
      // If they typed a custom name, save it so it shows up next time
      if (showCustom && customName.trim()) {
        window.localStorage.setItem(`otherside_custom_name_${role}`, customName.trim());
      }
    } catch {
      /* ignore */
    }
    router.push(searchParams.get("next") || "/");
    router.refresh();
  }

  const finalName = showCustom ? customName.trim() : name;

  return (
    <div className="login-screen">
      <div className="login-orbit login-orbit-1" aria-hidden="true"><Logo size={120} withWordmark={false} /></div>
      <div className="login-orbit login-orbit-2" aria-hidden="true"><Logo size={200} withWordmark={false} /></div>
      <div className="login-orbit login-orbit-3" aria-hidden="true"><Logo size={80} withWordmark={false} /></div>

      <div className="login-card">
        <div className="login-logo"><Logo size={44} withWordmark={false} /></div>
        <div className="login-brand">OTHERSIDE</div>
        <div className="login-sub">Command Center</div>

        {names === null ? (
          <form onSubmit={handlePassword} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="login-field">
              <input
                type={show ? "text" : "password"}
                autoFocus
                placeholder="Your team password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="login-input"
              />
              <button
                type="button"
                className="login-eye"
                onClick={() => setShow((s) => !s)}
                title={show ? "Hide password" : "Show password"}
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? "🙈" : "👁"}
              </button>
            </div>
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? "Checking…" : "Enter"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!finalName) return;
              finish(finalName);
            }}
            style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}
          >
            <div className="login-role-chip">{roleLabel}</div>
            <div className="login-who">Who are you?</div>

            {!showCustom ? (
              <>
                <select
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="login-input login-select"
                  autoFocus
                >
                  {names.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="login-back"
                  style={{ marginTop: -4 }}
                  onClick={() => setShowCustom(true)}
                >
                  I'm not listed — add my name
                </button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  autoFocus
                  placeholder="Type your name"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="login-input"
                />
                <button
                  type="button"
                  className="login-back"
                  style={{ marginTop: -4 }}
                  onClick={() => setShowCustom(false)}
                >
                  ← back to list
                </button>
              </>
            )}

            <button type="submit" className="login-btn" disabled={!finalName}>
              Continue →
            </button>
            <button
              type="button"
              className="login-back"
              onClick={() => {
                setNames(null);
                setPassword("");
                setShowCustom(false);
                setCustomName("");
              }}
            >
              ← different password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function labelFor(role: string): string {
  const map: Record<string, string> = {
    operations: "Operations",
    closer: "Closer",
    content: "Content Team",
    transformation: "Transformation Team",
  };
  return map[role] || "Team";
}
