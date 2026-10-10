
import { useState, type FormEvent } from "react";
import { supabase } from "./lib/supabase";

type Props = {
  organizationId: string;
  organizationName: string;
  role: string;
};

const inputStyle = {
  width: "100%",
  padding: "12px",
  border: "1px solid #D1D5DB",
  borderRadius: "8px",
  boxSizing: "border-box" as const,
  fontSize: "15px",
};

const buttonStyle = {
  padding: "12px 16px",
  background: "#16A34A",
  color: "#FFFFFF",
  border: "1px solid #16A34A",
  borderRadius: "8px",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};

const roles = [
  { value: "operations_manager", label: "Operations Manager" },
  { value: "department_manager", label: "Department Manager" },
  { value: "supervisor", label: "Supervisor" },
  { value: "employee", label: "Employee" },
  { value: "viewer", label: "Viewer" },
];

export default function PeopleInvitations({
  organizationId,
  organizationName,
  role,
}: Props) {
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("employee");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canInvite = ["owner", "org_admin"].includes(role);

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;
      if (!session?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const { data, error: inviteError } =
        await supabase.functions.invoke("invite-organization-member", {
          body: {
            organization_id: organizationId,
            email: email.trim().toLowerCase(),
            role: inviteRole,
          },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

      if (inviteError) {
        let details = inviteError.message;

        try {
          const response = await inviteError.context?.json();
          if (response?.error) details = response.error;
        } catch {
          // Keep the original error message.
        }

        throw new Error(details);
      }

      if (data?.error) throw new Error(data.error);
      if (!data?.success) {
        throw new Error("The invitation could not be confirmed.");
      }

      setMessage(`Invitation sent to ${email.trim()}.`);
      setEmail("");
      setInviteRole("employee");
    } catch (caughtError: unknown) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not send the invitation.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div>
        <h4 style={{ marginBottom: 8 }}>Invite a team member</h4>
        <p style={{ color: "#64748B", lineHeight: 1.6 }}>
          Invite people to join {organizationName}. They will receive an email
          invitation.
        </p>
      </div>

      {message && (
        <div
          role="status"
          style={{
            padding: 12,
            background: "#F0FDF4",
            color: "#166534",
            borderRadius: 8,
          }}
        >
          {message}
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            padding: 12,
            background: "#FEF2F2",
            color: "#B91C1C",
            borderRadius: 8,
          }}
        >
          {error}
        </div>
      )}

      {canInvite ? (
        <form
          onSubmit={(event) => void handleInvite(event)}
          style={{ display: "grid", gap: 16, maxWidth: 520 }}
        >
          <label style={{ display: "grid", gap: 8 }}>
            Team member email
            <input
              style={inputStyle}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="colleague@company.com"
              autoComplete="email"
              maxLength={254}
              required
            />
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            Organization role
            <select
              style={inputStyle}
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value)}
            >
              {roles.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
              {role === "owner" && (
                <option value="org_admin">Organization Admin</option>
              )}
            </select>
          </label>

          <div>
            <button
              type="submit"
              disabled={busy}
              style={{ ...buttonStyle, opacity: busy ? 0.65 : 1 }}
            >
              {busy ? "Sending invitation..." : "Send invitation"}
            </button>
          </div>
        </form>
      ) : (
        <p style={{ color: "#64748B" }}>
          Only the organization owner or an organization admin can send
          invitations.
        </p>
      )}

      <p style={{ fontSize: 13, color: "#64748B" }}>
        Invitations expire after seven days. Invitees must sign in using the
        email address the invitation was sent to.
      </p>
    </div>
  );
}
