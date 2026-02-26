import React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline";
  size?: "sm" | "md";
};

export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: Props) {
  const base =
    "inline-flex items-center justify-center rounded-lg font-medium transition " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 " +
    "disabled:opacity-50 disabled:cursor-not-allowed";

  const sizes = size === "sm" ? "px-3 py-1.5 text-sm" : "px-3.5 py-2 text-sm";

  const variants =
    variant === "primary"
      ? "bg-white/10 text-zinc-100 hover:bg-white/15 border border-white/10"
      : variant === "outline"
      ? "border border-white/10 text-zinc-100 hover:bg-white/10 bg-transparent"
      : "text-zinc-100 hover:bg-white/10 bg-transparent";

  return <button className={`${base} ${sizes} ${variants} ${className}`} {...props} />;
}