"use client";
import { useState } from "react";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) window.location.href = "/";
    else { setError("Wrong password. Try again."); setBusy(false); }
  }

  return (
    <div className="loading-screen">
      <div className="loading-mark" style={{ animation: "none" }}>Otherside</div>
      <div className="loading-note">Command Center — enter the team password</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="password"
          value={password}
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Password"
          style={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "10px 14px", fontSize: 14, width: 220 }}
        />
        <button className="refresh-btn" onClick={submit} disabled={busy || !password}>
          {busy ? "Checking…" : "Enter"}
        </button>
      </div>
      {error && <div style={{ color: "var(--red)", fontSize: 13 }}>{error}</div>}
    </div>
  );
}
