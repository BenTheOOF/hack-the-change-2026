"use client";

import { useState } from "react";
import { Icon } from "@/features/ui/icons";

export type Account = {
  id: string;
  email: string | null;
  display_name: string;
  role: "patient" | "therapist";
  is_admin: boolean;
  provider: string;
  created_at: string;
};
export type Assignment = { therapist_id: string; patient_id: string };

type Result = Promise<string | null>; // success message, or null when it failed

// Account management only: roles, admins, and patient assignments. No clinical data.
export function AdminConsole({
  accounts,
  assignments,
  selfId,
  busy,
  demo,
  onSetRole,
  onSetAdmin,
  onAssign,
  onUnassign,
  onRefresh,
}: {
  accounts: Account[];
  assignments: Assignment[];
  selfId: string;
  busy: boolean;
  demo: boolean;
  onSetRole: (account: Account, role: Account["role"]) => Result;
  onSetAdmin: (account: Account, value: boolean) => Result;
  onAssign: (therapist: Account, patient: Account) => Result;
  onUnassign: (therapist: Account, patient: Account) => Result;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [choice, setChoice] = useState<Record<string, string>>({});
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const q = query.trim().toLowerCase();
  const shown = accounts.filter(
    (a) =>
      !q ||
      a.display_name.toLowerCase().includes(q) ||
      (a.email ?? "").toLowerCase().includes(q) ||
      a.role.includes(q) ||
      (q === "admin" && a.is_admin),
  );
  const admins = accounts.filter((a) => a.is_admin).length;
  const run = async (action: Result) => {
    setStatus("");
    const message = await action;
    if (message) setStatus(message);
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Accounts and access</span>
          <h1>Admin console</h1>
          <p>
            Set who is a therapist, who can manage accounts, and which patients
            each therapist cares for. Clinical records stay with each patient&apos;s
            own therapist.
          </p>
        </div>
        {!demo && (
          <button className="secondary" onClick={onRefresh} disabled={busy}>
            <Icon name="refresh" /> Refresh
          </button>
        )}
      </div>
      <div className="stats-grid">
        <div className="stat-card sage">
          <span className="stat-label">Accounts</span>
          <div className="stat-value">{accounts.length}</div>
          <span className="stat-detail">Everyone who has signed up</span>
        </div>
        <div className="stat-card cream">
          <span className="stat-label">Therapists</span>
          <div className="stat-value">
            {accounts.filter((a) => a.role === "therapist").length}
          </div>
          <span className="stat-detail">Can review and prescribe</span>
        </div>
        <div className="stat-card peach">
          <span className="stat-label">Admins</span>
          <div className="stat-value">{admins}</div>
          <span className="stat-detail">At least one is always kept</span>
        </div>
      </div>
      <div className="panel admin-panel">
        <div className="section-heading">
          <h2>People</h2>
          <input
            className="admin-search"
            type="search"
            placeholder="Search name, email, role…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search accounts"
          />
        </div>
        {status && (
          <p className="form-success" role="status">
            <Icon name="check" size={18} /> {status}
          </p>
        )}
        <ul className="account-list">
          {shown.map((account) => {
            const canTreat = account.role === "therapist" || account.is_admin;
            const theirPatients = assignments
              .filter((a) => a.therapist_id === account.id)
              .map((a) => byId.get(a.patient_id))
              .filter((a): a is Account => !!a);
            const assignable = accounts.filter(
              (a) =>
                a.id !== account.id &&
                !theirPatients.some((p) => p.id === a.id),
            );
            const self = account.id === selfId;
            return (
              <li key={account.id} className="account-row">
                <div className="account-who">
                  <strong>
                    {account.display_name}
                    {self && <span className="muted"> (you)</span>}
                  </strong>
                  <small>
                    {account.email ?? "No email"} ·{" "}
                    {account.provider === "google" ? "Google" : "Email"}
                  </small>
                </div>
                <label className="account-role">
                  <span className="sr-only">Role for {account.display_name}</span>
                  <select
                    value={account.role}
                    disabled={busy}
                    onChange={(e) =>
                      void run(onSetRole(account, e.target.value as Account["role"]))
                    }
                  >
                    <option value="patient">Patient</option>
                    <option value="therapist">Therapist</option>
                  </select>
                </label>
                <label className="account-admin">
                  <input
                    type="checkbox"
                    checked={account.is_admin}
                    disabled={busy || (account.is_admin && admins <= 1)}
                    title={
                      account.is_admin && admins <= 1
                        ? "Keep at least one admin"
                        : undefined
                    }
                    onChange={(e) => {
                      const value = e.target.checked;
                      const ask = value
                        ? `Make ${account.display_name} an admin? Admins can change everyone's roles and access.`
                        : self
                          ? "Remove your own admin access? You will lose this console."
                          : `Remove admin access from ${account.display_name}?`;
                      if (window.confirm(ask)) void run(onSetAdmin(account, value));
                    }}
                  />
                  Admin
                </label>
                {canTreat && (
                  <div className="account-patients">
                    <span className="field-label">Patients</span>
                    <div className="chip-list">
                      {theirPatients.length === 0 && (
                        <span className="muted">None assigned</span>
                      )}
                      {theirPatients.map((p) => (
                        <span className="chip" key={p.id}>
                          {p.display_name}
                          <button
                            type="button"
                            aria-label={`Unassign ${p.display_name} from ${account.display_name}`}
                            disabled={busy}
                            onClick={() => void run(onUnassign(account, p))}
                          >
                            <Icon name="x" size={16} />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="assign-row">
                      <select
                        aria-label={`Patient to assign to ${account.display_name}`}
                        value={choice[account.id] ?? ""}
                        onChange={(e) =>
                          setChoice((c) => ({ ...c, [account.id]: e.target.value }))
                        }
                      >
                        <option value="">Assign a patient…</option>
                        {assignable.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.display_name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy || !choice[account.id]}
                        onClick={() => {
                          const patient = byId.get(choice[account.id]);
                          if (!patient) return;
                          setChoice((c) => ({ ...c, [account.id]: "" }));
                          void run(onAssign(account, patient));
                        }}
                      >
                        Assign
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
          {shown.length === 0 && <li className="muted">No accounts match.</li>}
        </ul>
      </div>
    </>
  );
}
