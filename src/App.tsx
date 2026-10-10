
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

function App() {
  const [status, setStatus] = useState("Testing connection...");
  const [details, setDetails] = useState("");

  useEffect(() => {
    let active = true;

    async function testConnection() {
      try {
        const { error } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (active) {
          setStatus("Supabase client connected");
          setDetails(
            "The frontend can communicate with Supabase Auth. No user needs to be logged in yet.",
          );
        }
      } catch (error) {
        if (active) {
          setStatus("Connection test failed");
          setDetails(
            error instanceof Error
              ? error.message
              : "An unexpected error occurred.",
          );
        }
      }
    }

    void testConnection();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main
      style={{
        fontFamily: "Arial, sans-serif",
        maxWidth: 700,
        margin: "80px auto",
        padding: 24,
        color: "#1F2937",
      }}
    >
      <h1 style={{ color: "#16A34A" }}>Forge</h1>
      <h2>System Setup</h2>
      <p>
        <strong>Status:</strong> {status}
      </p>
      <p>{details}</p>
    </main>
  );
}

export default App;
