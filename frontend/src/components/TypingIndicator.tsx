import { useEffect, useState } from "react";

export default function TypingIndicator({
  mode = "typing",
}: {
  mode?: "typing" | "searching" | "calculating";
}) {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const i = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 400);

    return () => clearInterval(i);
  }, []);

  if (mode === "searching") {
    return (
      <div className="flex flex-col gap-2 py-1">
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <span className="animate-pulse">🌐</span>
          <span className="tracking-wide">Searching the web{dots}</span>
        </div>

        <div className="relative h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
          <div className="absolute inset-0 animate-[shimmer_1.6s_linear_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        </div>

        <style>
          {`
            @keyframes shimmer {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
            }
          `}
        </style>
      </div>
    );
  }

  if (mode === "calculating") {
    return (
      <div className="flex flex-col gap-2 py-1">
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <span className="animate-pulse">🧮</span>
          <span className="tracking-wide">Calculating{dots}</span>
        </div>

        <div className="relative h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
          <div className="absolute inset-0 animate-[shimmer_1.2s_linear_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        </div>

        <style>
          {`
            @keyframes shimmer {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
            }
          `}
        </style>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 text-zinc-400 text-sm">
      <span className="animate-bounce">.</span>
      <span className="animate-bounce delay-150">.</span>
      <span className="animate-bounce delay-300">.</span>
    </div>
  );
}