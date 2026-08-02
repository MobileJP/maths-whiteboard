"use client";

import "mathlive";
import type { MathfieldElement } from "mathlive";
import { useEffect, useRef } from "react";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- required to augment JSX.IntrinsicElements
  namespace JSX {
    interface IntrinsicElements {
      "math-field": React.DetailedHTMLProps<React.HTMLAttributes<MathfieldElement>, MathfieldElement>;
    }
  }
}

interface MathFieldProps {
  value: string;
  onChange: (latex: string) => void;
  placeholder?: string;
}

// Wraps MathLive's <math-field> custom element for typed answers with a maths keyboard.
export function MathField({ value, onChange, placeholder }: MathFieldProps) {
  const ref = useRef<MathfieldElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (placeholder) el.placeholder = placeholder;
    const handler = () => onChange(el.value);
    el.addEventListener("input", handler);
    return () => el.removeEventListener("input", handler);
  }, [onChange, placeholder]);

  useEffect(() => {
    const el = ref.current;
    if (el && el.value !== value) {
      el.value = value;
    }
  }, [value]);

  return (
    <math-field
      ref={ref}
      style={{
        display: "block",
        width: "100%",
        fontSize: "1.25rem",
        padding: "0.5rem 0.75rem",
        border: "1px solid #ccc",
        borderRadius: "0.5rem",
      }}
    />
  );
}
