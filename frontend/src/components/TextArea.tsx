import React, { useLayoutEffect, useRef } from "react";

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  maxHeightPx?: number;
};

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (value: T) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === "function") ref(value);
      else (ref as React.MutableRefObject<T>).current = value;
    }
  };
}

const Textarea = React.forwardRef<HTMLTextAreaElement, Props>(function Textarea(
  { className = "", maxHeightPx = 520, onChange, value, defaultValue, ...props },
  ref
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  const resize = () => {
    const el = innerRef.current;
    if (!el) return;

    el.style.height = "0px";

    const next = Math.min(el.scrollHeight, maxHeightPx);
    el.style.height = `${next}px`;

    el.style.overflowY = el.scrollHeight > maxHeightPx ? "auto" : "hidden";
  };

  useLayoutEffect(() => {
    resize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useLayoutEffect(() => {
    resize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <textarea
      ref={mergeRefs(innerRef, ref)}
      value={value}
      defaultValue={defaultValue}
      {...props}
      onChange={(e) => {
        resize();
        onChange?.(e);
      }}
      className={
        "w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 " +
        "placeholder:text-zinc-500 outline-none focus:border-zinc-600 overflow-hidden " +
        className
      }
      style={{
        minHeight: 56,
        ...(props.style ?? {}),
      }}
    />
  );
});

export default Textarea;