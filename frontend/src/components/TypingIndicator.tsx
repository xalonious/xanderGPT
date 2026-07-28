import { useEffect, useState } from "react";

export default function TypingIndicator({
  mode = "typing",
  imageCount = 1,
}: {
  mode?:
    | "typing"
    | "searching"
    | "calculating"
    | "fetching"
    | "compacting"
    | "processing-image";
  imageCount?: number;
}) {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const i = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 400);

    return () => clearInterval(i);
  }, []);

  if (mode === "processing-image") {
    const label = imageCount === 1 ? "Processing image" : `Processing ${imageCount} images`;

    return (
      <div className="flex flex-col gap-2 py-1">
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <span
            className="flex h-5 w-5 items-center justify-center rounded-md border border-white/10 bg-white/5"
            aria-hidden="true"
          >
            <span className="h-2.5 w-2.5 animate-pulse rounded-sm bg-zinc-400" />
          </span>
          <span className="tracking-wide">
            {label}
            {dots}
          </span>
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

  if (mode === "compacting") {
    return (
      <div className="flex flex-col gap-2 py-1">
        <div className="flex items-center gap-2.5 text-sm text-zinc-300">
          <span className="flex h-5 w-5 items-center justify-center rounded-md border border-white/10 bg-white/5">
            <span className="flex flex-col items-center gap-0.5" aria-hidden="true">
              <span className="h-px w-2.5 animate-pulse bg-zinc-300" />
              <span className="h-px w-2 animate-pulse bg-zinc-400" />
              <span className="h-px w-1.5 animate-pulse bg-zinc-500" />
            </span>
          </span>
          <span className="tracking-wide">
            Compacting conversation so we can keep chatting{dots}
          </span>
        </div>

        <div className="relative h-1.5 w-64 max-w-full overflow-hidden rounded-full bg-white/10">
          <div className="absolute inset-0 animate-[shimmer_1.8s_linear_infinite] bg-gradient-to-r from-transparent via-white/35 to-transparent" />
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

  if (mode === "fetching") {
    return (
      <div className="flex flex-col gap-2 py-1">
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <span className="animate-pulse">🔗</span>
          <span className="tracking-wide">Fetching URL{dots}</span>
        </div>

        <div className="relative h-1.5 w-44 overflow-hidden rounded-full bg-white/10">
          <div className="absolute inset-0 animate-[shimmer_1.4s_linear_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
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
