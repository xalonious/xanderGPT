import { Outlet, useNavigate, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../auth/AuthContext";
import { ConversationsProvider } from "../hooks/useConversations";
import UserMenu from "../components/UserMenu";

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [sidebarMounted, setSidebarMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const openSidebar = () => {
    setSidebarMounted(true);
    requestAnimationFrame(() => setSidebarOpen(true));
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  useEffect(() => {
    if (!sidebarMounted) return;
    if (sidebarOpen) return;

    const t = window.setTimeout(() => setSidebarMounted(false), 220); 
    return () => window.clearTimeout(t);
  }, [sidebarMounted, sidebarOpen]);

  useEffect(() => {
    if (!sidebarMounted) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSidebar();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sidebarMounted]);

  const onLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <ConversationsProvider>
      <div className="h-screen overflow-hidden flex text-zinc-100">
        <div className="hidden md:block">
          <Sidebar />
        </div>

        {sidebarMounted && (
          <div className="md:hidden fixed inset-0 z-50">
            <div
              className={[
                "absolute inset-0 bg-black/60 transition-opacity duration-200",
                sidebarOpen ? "opacity-100" : "opacity-0",
              ].join(" ")}
              onClick={closeSidebar}
            />

            <div
              className={[
                "absolute left-0 top-0 bottom-0 w-[280px] max-w-[85vw]",
                "transition-transform duration-200 ease-out",
                sidebarOpen ? "translate-x-0" : "-translate-x-full",
              ].join(" ")}
              onClick={(e) => e.stopPropagation()}
            >
              <Sidebar />
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 flex flex-col">
          <header className="h-14 shrink-0 border-b border-white/10 bg-[rgb(var(--bg2))] flex items-center justify-between px-5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="md:hidden h-9 w-9 rounded-lg border border-white/10 bg-zinc-900/40 hover:bg-zinc-900/60"
                onClick={openSidebar}
                aria-label="Open sidebar"
              >
                <div className="mx-auto w-4 space-y-1">
                  <div className="h-[2px] w-full bg-zinc-200/80" />
                  <div className="h-[2px] w-full bg-zinc-200/80" />
                  <div className="h-[2px] w-full bg-zinc-200/80" />
                </div>
              </button>

              <Link to="/c/new" className="inline-flex items-center" aria-label="Go to new chat">
                <img src="/logo.svg" alt="XanderGPT" className="h-10 w-10 opacity-90" />
              </Link>
            </div>

            <div className="flex items-center gap-3">
              <UserMenu email={user?.email ?? "?"} onLogout={onLogout} />
            </div>
          </header>

          <main className="flex-1 min-h-0 flex flex-col">
            <Outlet />
          </main>
        </div>
      </div>
    </ConversationsProvider>
  );
}