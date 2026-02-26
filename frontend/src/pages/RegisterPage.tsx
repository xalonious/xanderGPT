import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Button from "../components/Button";

function getNiceAuthError(err: any) {
  const status = err?.response?.status as number | undefined;
  const data = err?.response?.data;

  const serverMsg =
    (typeof data === "string" && data) ||
    data?.error ||
    data?.message ||
    data?.detail ||
    data?.errors?.[0]?.message;

  if (status === 409) return "An account with that email already exists.";
  if (status === 400) return serverMsg || "Please check your details and try again.";
  if (status && status >= 500) return "Server error. Please try again in a moment.";

  if (typeof serverMsg === "string" && serverMsg.trim().length > 0) return serverMsg;

  return "Register failed. Please try again.";
}

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && password.trim().length > 0 && !submitting;
  }, [email, password, submitting]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await register(email.trim(), password);
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(getNiceAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10 text-zinc-100">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img src="/logo.svg" alt="XanderGPT" className="mx-auto mb-4 h-24 w-24 sm:h-28 sm:w-28" />
          <div className="text-2xl font-semibold tracking-tight">XanderGPT</div>
          <div className="mt-1 text-sm text-zinc-400">Create an account</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
          <h1 className="text-lg font-semibold">Create account</h1>
          <p className="mt-1 text-sm text-zinc-400">Then we’ll log you in.</p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="text-sm text-zinc-300">Email</label>
              <input
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-white/20 focus:bg-black/25"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="text-sm text-zinc-300">Password</label>
              <input
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-white/20 focus:bg-black/25"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <div className="mt-2 text-xs text-zinc-500">Use at least 8 characters (recommended).</div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}

            <Button className="w-full" disabled={!canSubmit}>
              {submitting ? "Creating…" : "Register"}
            </Button>
          </form>

          <p className="mt-4 text-sm text-zinc-400">
            Already have an account?{" "}
            <Link className="text-zinc-200 hover:text-white underline underline-offset-2" to="/login">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}