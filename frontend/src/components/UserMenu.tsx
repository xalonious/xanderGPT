import { useEffect, useMemo, useRef, useState } from "react";

export default function UserMenu({
  email,
  onLogout,
}: {
  email: string;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const initial = useMemo(() => {
    const v = (email ?? "").trim();
    return (v[0] ?? "?").toUpperCase();
  }, [email]);

  useEffect(() => {
    if (!open) return;

    const onDocMouseDown = (e: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-9 w-9 rounded-full border border-white/10 bg-zinc-900/40 backdrop-blur flex items-center justify-center text-sm font-semibold text-zinc-100 shadow-[0_8px_20px_rgba(0,0,0,0.25)] hover:bg-zinc-900/60 focus:outline-none focus:ring-2 focus:ring-zinc-600"
        aria-haspopup="menu"
        aria-expanded={open}
        title={email}
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 rounded-xl border border-white/10 bg-zinc-950/90 backdrop-blur shadow-[0_15px_40px_rgba(0,0,0,0.45)] overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-white/10">
            <div className="text-xs text-zinc-400">Signed in as</div>
            <div className="text-sm text-zinc-100 truncate">{email}</div>
          </div>

          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="w-full text-left px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-900/60"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}