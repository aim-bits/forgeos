import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import PeopleInvitations from "./PeopleInvitations";

type OrganizationRole =
  | "owner"
  | "org_admin"
  | "operations_manager"
  | "department_manager"
  | "supervisor"
  | "employee"
  | "viewer";

type Organization = {
  id: string;
  name: string;
  role: OrganizationRole;
};

type WorkspaceSection =
  | "Dashboard"
  | "Work"
  | "Goals"
  | "Knowledge"
  | "Performance"
  | "People"
  | "Settings";

const validOrganizationRoles: OrganizationRole[] = [
  "owner",
  "org_admin",
  "operations_manager",
  "department_manager",
  "supervisor",
  "employee",
  "viewer",
];

const pageStyle = {
  minHeight: "100vh",
  background: "#F8FAFC",
  color: "#1F2937",
  fontFamily: "Arial, sans-serif",
  padding: "32px 20px",
  boxSizing: "border-box" as const,
};

const panelStyle = {
  width: "100%",
  maxWidth: "960px",
  margin: "28px auto",
  padding: "28px",
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
  padding: "12px 16px",
  background: "#16A34A",
  color: "#FFFFFF",
  border: "1px solid #16A34A",
  borderRadius: "8px",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};

const sectionDescriptions: Record<WorkspaceSection, string> = {
  Dashboard:
    "A central view of priorities, progress and operational health. Summary metrics will be connected as the modules are implemented.",
  Work:
    "Create, assign and track work with priorities, due dates and acceptance criteria.",
  Goals:
    "Connect objectives to measurable key results, tasks and weekly progress check-ins.",
  Knowledge:
    "Keep team procedures, policies and operating knowledge organised in one place.",
  Performance:
    "Review measurable outcomes, progress and performance history over time.",
  People:
    "Manage organisation membership, employee access and invitations.",
  Settings:
    "Configure the organisation profile, workspace preferences and permissions.",
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
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [workspaceSection, setWorkspaceSection] =
    useState<WorkspaceSection>("Dashboard");
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
        setSelectedOrganizationId("");
        setWorkspaceSection("Dashboard");
        setOrganizationLoading(false);
        return;
      }

      setOrganizationLoading(true);
      setError("");

      try {
        const { data: organizationData, error: organizationError } =
          await supabase
            .from("organizations")
            .select("id, name")
            .order("name");

        if (organizationError) throw organizationError;

        const { data: membershipData, error: membershipError } =
          await supabase
            .from("organization_members")
            .select("organization_id, role")
            .eq("user_id", session.user.id)
            .eq("status", "active");

        if (membershipError) throw membershipError;
        if (!active) return;

        const roleByOrganization = new Map<string, string>(
          (membershipData ?? []).map(
            (membership: { organization_id: string; role: string }) => [
              membership.organization_id,
              membership.role,
            ],
          ),
        );

        const loadedOrganizations: Organization[] = (
          organizationData ?? []
        )
          .filter((organization) =>
            roleByOrganization.has(organization.id),
          )
          .map((organization) => {
            const role = roleByOrganization.get(organization.id);

            if (
              typeof role !== "string" ||
              !validOrganizationRoles.includes(role as OrganizationRole)
            ) {
              throw new Error(
                "An organisation has an invalid membership role.",
              );
            }

            return {
              id: organization.id,
              name: organization.name,
              role: role as OrganizationRole,
            };
          });

        setOrganizations(loadedOrganizations);
        setSelectedOrganizationId((current) =>
          loadedOrganizations.some((org) => org.id === current)
            ? current
            : loadedOrganizations[0]?.id ?? "",
        );
      } catch (caughtError: unknown) {
        if (!active) return;

        setError(
          caughtError instanceof Error
            ? `Could not load organisations: ${caughtError.message}`
            : "Could not load organisations.",
        );
      } finally {
        if (active) setOrganizationLoading(false);
      }
    }

    void loadOrganizations();

    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
  if (!session) return;

  const params = new URLSearchParams(window.location.search);
  const invitationId = params.get("invitation_id");

  if (!invitationId) return;

  let active = true;

  async function acceptInvitation() {
    setBusy(true);
    setError("");
    setMessage("Processing your organization invitation...");

    try {
      const {
        data: { session: currentSession },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (
        !currentSession?.access_token ||
        currentSession.user.id !== session?.user?.id
      ) {
        throw new Error("Please sign in again to accept this invitation.");
      }

      const { data, error: acceptError } =
        await supabase.functions.invoke("accept-organization-invitation", {
          body: { invitation_id: invitationId },
          headers: {
            Authorization: `Bearer ${currentSession.access_token}`,
          },
        });

      if (acceptError) {
        let details = acceptError.message;

        try {
          const response = await acceptError.context?.json();
          if (response?.error) details = response.error;
        } catch {
          // Keep the original error message.
        }

        throw new Error(details);
      }

      if (data?.error) throw new Error(data.error);
      if (!data?.success || !data?.organization_id) {
        throw new Error("The invitation could not be confirmed.");
      }

      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select("id, name")
        .eq("id", data.organization_id)
        .single();

      if (orgError) throw orgError;

      const { data: membership, error: membershipError } = await supabase
        .from("organization_members")
        .select("role, status")
        .eq("organization_id", data.organization_id)
        .eq("user_id", currentSession.user.id)
        .eq("status", "active")
        .single();

      if (membershipError) throw membershipError;

      if (!active) return;

      if (!validOrganizationRoles.includes(membership.role as OrganizationRole)) {
        throw new Error("The organization membership role is invalid.");
      }

      setOrganizations((current) => {
        const updated: Organization = {
          id: orgData.id,
          name: orgData.name,
          role: membership.role as OrganizationRole,
        };

        return [
          updated,
          ...current.filter((org) => org.id !== updated.id),
        ];
      });

      setSelectedOrganizationId(orgData.id);
      setWorkspaceSection("Dashboard");
      setMessage(`You have joined ${orgData.name}.`);
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname + window.location.hash,
      );
    } catch (caughtError: unknown) {
      if (!active) return;

      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not accept the organization invitation.",
      );
      setMessage("");
    } finally {
      if (active) setBusy(false);
    }
  }

  void acceptInvitation();

  return () => {
    active = false;
  };
}, [session?.user.id]);

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
        throw new Error(
          "Please sign in again before creating an organisation.",
        );
      }

      if (currentSession.user.id !== session?.user?.id) {
        throw new Error(
          "Your session is out of date. Refresh and sign in again.",
        );
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

      const result = data as unknown as { id: string; name: string };

      if (
        typeof result.id !== "string" ||
        typeof result.name !== "string"
      ) {
        throw new Error("The database returned an invalid organisation.");
      }

      setOrganizations((current) => {
        const existing = current.find((org) => org.id === result.id);
        if (existing) return current;

        return [
          ...current,
          {
            id: result.id,
            name: result.name,
            role: "owner",
          },
        ];
      });

      setSelectedOrganizationId(result.id);
      setWorkspaceSection("Dashboard");
      setOrganizationName("");
      setMessage(`Organisation "${result.name}" created successfully.`);
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
      setSelectedOrganizationId("");
      setWorkspaceSection("Dashboard");
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

  const selectedOrganization = organizations.find(
    (organization) => organization.id === selectedOrganizationId,
  );

  const canManagePeople =
    selectedOrganization !== undefined &&
    [
      "owner",
      "org_admin",
      "operations_manager",
    ].includes(selectedOrganization.role);

  const canManageSettings =
    selectedOrganization !== undefined &&
    ["owner", "org_admin"].includes(selectedOrganization.role);

  const navigationItems: WorkspaceSection[] = [
    "Dashboard",
    "Work",
    "Goals",
    "Knowledge",
    "Performance",
    ...(canManagePeople ? ["People" as const] : []),
    ...(canManageSettings ? ["Settings" as const] : []),
  ];

  if (!authReady) {
    return (
      <main style={pageStyle}>
        <section style={{ ...panelStyle, maxWidth: 480 }}>
          <h1 style={{ color: "#16A34A" }}>Forge</h1>
          <p>Restoring your session...</p>
        </section>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <header
        style={{
          maxWidth: 960,
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ color: "#16A34A", fontSize: 34, margin: 0 }}>
            Forge
          </h1>
          <p style={{ color: "#64748B", marginTop: 6, marginBottom: 0 }}>
            Your operations and performance workspace
          </p>
        </div>

        {session && (
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={busy}
            style={{
              ...buttonStyle,
              background: "#FFFFFF",
              color: "#166534",
            }}
          >
            {busy ? "Please wait..." : "Sign out"}
          </button>
        )}
      </header>

      <section
        style={{
          ...panelStyle,
          maxWidth: session ? 960 : 480,
        }}
      >
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
                  width: "100%",
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
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2 style={{ marginTop: 0, marginBottom: 8 }}>
                  Your Forge workspace
                </h2>
                <p style={{ color: "#64748B", marginTop: 0 }}>
                  Signed in as <strong>{session.user.email}</strong>
                </p>
              </div>
            </div>

            <hr
              style={{
                border: 0,
                borderTop: "1px solid #E5E7EB",
                margin: "24px 0",
              }}
            />

            <section aria-labelledby="organizations-heading">
              <h3 id="organizations-heading">Your organisations</h3>

              {organizationLoading ? (
                <p>Loading organisations and access...</p>
              ) : organizations.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12,
                  }}
                >
                  {organizations.map((organization) => {
                    const selected =
                      organization.id === selectedOrganizationId;

                    return (
                      <button
                        key={organization.id}
                        type="button"
                        onClick={() => {
                          setSelectedOrganizationId(organization.id);
                          setWorkspaceSection("Dashboard");
                          setError("");
                          setMessage("");
                        }}
                        aria-pressed={selected}
                        style={{
                          textAlign: "left",
                          padding: 16,
                          borderRadius: 10,
                          border: selected
                            ? "2px solid #16A34A"
                            : "1px solid #E5E7EB",
                          background: selected ? "#F0FDF4" : "#FFFFFF",
                          cursor: "pointer",
                          color: "#1F2937",
                        }}
                      >
                        <strong>{organization.name}</strong>
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 13,
                            color: "#64748B",
                            textTransform: "capitalize",
                          }}
                        >
                          Role: {organization.role.replaceAll("_", " ")}
                        </div>
                        {selected && (
                          <div
                            style={{
                              marginTop: 8,
                              color: "#15803D",
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            Selected workspace
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p style={{ color: "#64748B" }}>
                  You haven't created or joined an organisation yet. Create a
                  workspace below to get started.
                </p>
              )}
            </section>

            {selectedOrganization && (
              <section
                style={{
                  marginTop: 32,
                  paddingTop: 24,
                  borderTop: "1px solid #E5E7EB",
                }}
                aria-labelledby="workspace-heading"
              >
                <p
                  style={{
                    fontSize: 12,
                    color: "#64748B",
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    marginBottom: 6,
                  }}
                >
                  Current workspace
                </p>
                <h2 id="workspace-heading" style={{ marginTop: 0 }}>
                  {selectedOrganization.name}
                </h2>
                <p style={{ color: "#64748B" }}>
                  Your role:{" "}
                  <strong style={{ textTransform: "capitalize" }}>
                    {selectedOrganization.role.replaceAll("_", " ")}
                  </strong>
                </p>

                <nav
                  aria-label="Workspace navigation"
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    marginTop: 20,
                  }}
                >
                  {navigationItems.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setWorkspaceSection(item)}
                      aria-current={
                        workspaceSection === item ? "page" : undefined
                      }
                      style={{
                        ...buttonStyle,
                        background:
                          workspaceSection === item ? "#16A34A" : "#FFFFFF",
                        color:
                          workspaceSection === item ? "#FFFFFF" : "#1F2937",
                        borderColor:
                          workspaceSection === item ? "#16A34A" : "#E5E7EB",
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </nav>

                <div
                  style={{
                    marginTop: 20,
                    padding: 22,
                    border: "1px solid #E5E7EB",
                    borderRadius: 12,
                    background: "#FFFFFF",
                  }}
                >
                  <h3 style={{ marginTop: 0 }}>{workspaceSection}</h3>
                  <p style={{ color: "#64748B", lineHeight: 1.6 }}>
                    {sectionDescriptions[workspaceSection]}
                  </p>

                  {workspaceSection === "Dashboard" ? (
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 10,
                        background: "#F0FDF4",
                        color: "#166534",
                      }}
                    >
                      Welcome to {selectedOrganization.name}. Your workspace foundation is
                      ready.
                    </div>
                    ) : workspaceSection === "People" ? (
                      <PeopleInvitations
                        organizationId={selectedOrganization.id}
                        organizationName={selectedOrganization.name}
                        role={selectedOrganization.role}
                      />
                    ) : (
                    <p style={{ fontSize: 13, color: "#94A3B8" }}>
                      This module is a navigation placeholder and will be implemented in a
                      later build step.
                    </p>
                  )}
                </div>
              </section>
            )}

            <section
              style={{
                marginTop: 32,
                paddingTop: 24,
                borderTop: "1px solid #E5E7EB",
              }}
              aria-labelledby="create-organization-heading"
            >
              <h3 id="create-organization-heading">Create an organisation</h3>
              <p style={{ color: "#64748B" }}>
                Register a company workspace. Your account will become its
                owner.
              </p>

              <form
                onSubmit={(event) => void handleCreateOrganization(event)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: 12,
                  alignItems: "end",
                }}
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
            </section>
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
