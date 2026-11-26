"use client";

import React from "react";

const field = {
  width: "100%", boxSizing: "border-box", padding: "12px 13px", borderRadius: 9,
  border: "1px solid #d8dbe4", background: "#fff", color: "#171a2b",
  font: "inherit", fontSize: 14,
};

export default function BusinessProfileSetup({ busy, error, onCreate }) {
  const [displayName, setDisplayName] = React.useState("");
  const [kind, setKind] = React.useState("company");
  const [legalName, setLegalName] = React.useState("");
  const canCreate = displayName.trim().length >= 2 && (kind !== "company" || legalName.trim().length >= 2) && !busy;

  function submit(event) {
    event.preventDefault();
    if (!canCreate) return;
    onCreate({ displayName: displayName.trim(), kind, legalName: legalName.trim() });
  }

  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, boxSizing: "border-box", background: "#f5f6fa", color: "#171a2b", fontFamily: "Inter, system-ui, sans-serif" }}>
      <section style={{ width: "min(480px, 100%)", padding: 28, borderRadius: 16, border: "1px solid #e2e5ed", background: "#fff", boxShadow: "0 18px 50px rgba(20,24,40,.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 28 }}>
          <img src="/elementpay-logo.png" alt="" width="24" height="24" style={{ borderRadius: 6 }} />
          <span style={{ fontSize: 14, fontWeight: 700 }}>ElementPay</span>
          <span style={{ marginLeft: "auto", color: "#6b7184", fontSize: 12 }}>One-time setup</span>
        </div>
        <h1 style={{ margin: "0 0 8px", fontSize: 24, letterSpacing: "-.025em" }}>Set up your payment profile</h1>
        <p style={{ margin: "0 0 24px", color: "#697187", fontSize: 13.5, lineHeight: 1.55 }}>
          Payment links need a business profile. This name appears to your customers and in your payment links.
        </p>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, fontWeight: 600 }}>
            Store or business name
            <input autoFocus required minLength={2} maxLength={120} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Quivlabs Ltd" style={field} />
          </label>
          <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
            <legend style={{ marginBottom: 8, fontSize: 12.5, fontWeight: 600 }}>Business type</legend>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[["company", "Registered company"], ["solo", "Sole proprietor"]].map(([value, label]) => {
                const selected = kind === value;
                return <button key={value} type="button" onClick={() => setKind(value)} aria-pressed={selected} style={{ padding: "10px 9px", borderRadius: 9, border: `1px solid ${selected ? "#4338ca" : "#d8dbe4"}`, background: selected ? "#f1f0ff" : "#fff", color: selected ? "#3730a3" : "#34394b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{label}</button>;
              })}
            </div>
          </fieldset>
          {kind === "company" ? (
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, fontWeight: 600 }}>
              Registered legal name
              <input required minLength={2} maxLength={120} value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="As registered with the relevant authority" style={field} />
            </label>
          ) : null}
          {error ? <p role="alert" style={{ margin: 0, padding: "10px 12px", borderRadius: 8, background: "#fff0f0", color: "#a52c2c", fontSize: 12.5, lineHeight: 1.45 }}>{error}</p> : null}
          <button type="submit" disabled={!canCreate} style={{ marginTop: 4, padding: 12, border: 0, borderRadius: 9, background: "#4338ca", color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: canCreate ? "pointer" : "not-allowed", opacity: canCreate ? 1 : .5 }}>
            {busy ? "Setting up your profile…" : "Continue to dashboard"}
          </button>
        </form>
      </section>
    </main>
  );
}
