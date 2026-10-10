
import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";

type Organization = {
  id: string;
  name: string;
};

const pageStyle = {
  minHeight: "100vh",
  background: "#F8FAFC",
  color: "#1F2937",
  fontFamily: "Arial, sans-serif",
  padding: "40px 20px",
  boxSizing: "border-box" as const,
};

const panelStyle = {
  width: "100%",
  maxWidth: "480px",
  margin: "40px auto",
  padding: "32px",
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: "16px",
  boxSizing: "border-box" as const,
  boxShadow: "0 8px 30px rgba(15, 23, 42, 0.05)",
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
  width: "100%",
  padding: "13px",
  background: "#16A34A",
  color: "#FFFFFF",
  border: "none",
  borderRadius: "8px",
  fontSize: "15px",
  fontWeight: 600,
  cursor: "pointer",
};

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [busy, setBusy] = useState(false);
  const [organizationLoading, setOrganizationLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setAuthReady(true);
      }
    });

    void supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return;

        if (sessionError) {
          setError(sessionError.message);
        } else {
          setSession(data.session);
        }

        setAuthReady(true);
      })
      .catch((caughtError: unknown) => {
        if (!active) return;
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not restore your session.",
        );
        setAuthReady(true);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadOrganizations() {
      if (!session) {
        setOrganizations([]);
        setOrganizationLoading(false);
        return;
      }

      setOrganizationLoading(true);

      const { data, error: queryError } = await supabase
        .from("organizations")
        .select("id, name")
        .order("name");

      if (!active) return;

      if (queryError) {
        setError(`Could not load organisations: ${queryError.message}`);
      } else {
        setOrganizations(data ?? []);
      }

      setOrganizationLoading(false);
    }

    void loadOrganizations();

    return () => {
      active = false;
    };
  }, [session]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      if (mode === "signup") {
        const { data, error: signupError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: displayName.trim(),
            },
          },
        });

        if (signupError) throw signupError;

        if (data.session) {
          setSession(data.session);
          setMessage("Account created successfully.");
        } else {
          setMessage(
            "Account request submitted. Check your email for a confirmation link before logging in.",
          );
          setMode("login");
        }
      } else {
        const { data, error: loginError } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

        if (loginError) throw loginError;

        setSession(data.session);
        setMessage("You are signed in.");
      }

      setPassword("");
    } catch (caughtError: unknown) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Authentication failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  

async function handleCreateOrganization(
  event: FormEvent<HTMLFormElement>,
) {
  event.preventDefault();
  setBusy(true);
  setError("");
  setMessage("");

  try {
    const {
      data: { session: currentSession },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) throw sessionError;

    if (!currentSession?.user) {
      throw new Error("Please sign in again before creating an organisation.");
    }

    if (currentSession.user.id !== session?.user?.id) {
      throw new Error("Your session is out of date. Refresh and sign in again.");
    }

    const trimmedName = organizationName.trim();

    if (trimmedName.length < 2 || trimmedName.length > 150) {
      throw new Error(
        "Organisation name must be between 2 and 150 characters.",
      );
    }

    const { data, error: createError } = await supabase
      .rpc("create_organization", {
        p_name: trimmedName,
      })
      .single();

    if (createError) {
      console.error("Forge organisation creation error:", {
        code: createError.code,
        message: createError.message,
        details: createError.details,
        hint: createError.hint,
      });

      throw new Error(
        `Could not create organisation: ${createError.message} (code: ${createError.code})`,
      );
    }

    if (!data) {
      throw new Error("The database did not return the new organisation.");
    }

    setOrganizations((current) => [
      ...current,
      { id: data.id, name: data.name },
    ]);

    setOrganizationName("");
    setMessage(`Organisation "${data.name}" created successfully.`);
  } catch (caughtError: unknown) {
    const errorMessage =
      caughtError instanceof Error
        ? caughtError.message
        : "An unexpected error occurred.";

    console.error("Forge organisation creation failed:", errorMessage);
    setError(errorMessage);
  } finally {
    setBusy(false);
  }
}



  async function handleLogout() {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const { error: logoutError } = await supabase.auth.signOut();
      if (logoutError) throw logoutError;

      setSession(null);
      setOrganizations([]);
      setMessage("You have signed out.");
    } catch (caughtError: unknown) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not sign out.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!authReady) {
    return (
      <main style={pageStyle}>
        <section style={panelStyle}>
          <h1 style={{ color: "#16A34A" }}>Forge</h1>
          <p>Restoring your session...</p>
        </section>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <header style={{ textAlign: "center" }}>
        <h1 style={{ color: "#16A34A", fontSize: "38px", marginBottom: 8 }}>
          Forge
        </h1>
        <p style={{ color: "#64748B", marginTop: 0 }}>
          Your operations and performance workspace
        </p>
      </header>

      <section style={panelStyle}>
        {error && (
          <div
            role="alert"
            style={{
              padding: 12,
              marginBottom: 16,
              borderRadius: 8,
              background: "#FEF2F2",
              color: "#B91C1C",
              overflowWrap: "anywhere",
            }}
          >
            {error}
          </div>
        )}

        {message && (
          <div
            role="status"
            style={{
              padding: 12,
              marginBottom: 16,
              borderRadius: 8,
              background: "#F0FDF4",
              color: "#166534",
              overflowWrap: "anywhere",
            }}
          >
            {message}
          </div>
        )}

        {!session ? (
          <>
            <h2>{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
            <p style={{ color: "#64748B" }}>
              {mode === "signup"
                ? "Get started with your Forge workspace."
                : "Sign in to continue to Forge."}
            </p>

            <form
              onSubmit={(event) => void handleAuth(event)}
              style={{ display: "grid", gap: 16 }}
            >
              {mode === "signup" && (
                <label style={{ display: "grid", gap: 8 }}>
                  Full name
                  <input
                    style={inputStyle}
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    autoComplete="name"
                    maxLength={100}
                    required
                    placeholder="Your name"
                  />
                </label>
              )}

              <label style={{ display: "grid", gap: 8 }}>
                Email address
                <input
                  style={inputStyle}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                  placeholder="you@company.com"
                />
              </label>

              <label style={{ display: "grid", gap: 8 }}>
                Password
                <input
                  style={inputStyle}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  minLength={8}
                  required
                  placeholder="At least 8 characters"
                />
              </label>

              <button
                type="submit"
                style={{
                  ...buttonStyle,
                  opacity: busy ? 0.65 : 1,
                }}
                disabled={busy}
              >
                {busy
                  ? "Please wait..."
                  : mode === "signup"
                    ? "Create account"
                    : "Sign in"}
              </button>
            </form>

            <p style={{ textAlign: "center", marginTop: 24 }}>
              {mode === "signup"
                ? "Already have an account?"
                : "New to Forge?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "signup" ? "login" : "signup");
                  setError("");
                  setMessage("");
                }}
                style={{
                  border: "none",
                  background: "none",
                  color: "#15803D",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {mode === "signup" ? "Sign in" : "Create account"}
              </button>
            </p>
          </>
        ) : (
          <>
            <h2>Your Forge workspace</h2>
            <p>
              Signed in as <strong>{session.user.email}</strong>
            </p>

            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={busy}
              style={{
                ...buttonStyle,
                background: "#FFFFFF",
                color: "#166534",
                border: "1px solid #16A34A",
                marginBottom: 24,
              }}
            >
              {busy ? "Please wait..." : "Sign out"}
            </button>

            <hr style={{ border: 0, borderTop: "1px solid #E5E7EB" }} />

            <h3>Your organisations</h3>

            {organizationLoading ? (
              <p>Loading organisations...</p>
            ) : organizations.length > 0 ? (
              <ul style={{ paddingLeft: 20 }}>
                {organizations.map((organization) => (
                  <li key={organization.id} style={{ marginBottom: 10 }}>
                    <strong>{organization.name}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: "#64748B" }}>
                You haven't created or joined an organisation yet.
              </p>
            )}

            <h3>Create an organisation</h3>
            <p style={{ color: "#64748B" }}>
              Register a company workspace. Your account will become its owner.
            </p>

            <form
              onSubmit={(event) => void handleCreateOrganization(event)}
              style={{ display: "grid", gap: 12 }}
            >
              <label style={{ display: "grid", gap: 8 }}>
                Organisation name
                <input
                  style={inputStyle}
                  value={organizationName}
                  onChange={(event) =>
                    setOrganizationName(event.target.value)
                  }
                  minLength={2}
                  maxLength={150}
                  required
                  placeholder="e.g. Acme Limited"
                />
              </label>

              <button
                type="submit"
                style={{
                  ...buttonStyle,
                  opacity: busy ? 0.65 : 1,
                }}
                disabled={busy}
              >
                {busy ? "Please wait..." : "Create organisation"}
              </button>
            </form>
          </>
        )}
      </section>

      <footer
        style={{
          textAlign: "center",
          color: "#94A3B8",
          fontSize: 13,
          marginTop: 24,
        }}
      >
        Forge · Secure workspace for teams
      </footer>
    </main>
  );
}

export default App;
