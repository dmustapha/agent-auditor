"use client";

import { useState, useCallback } from "react";
import type { InputType } from "@/lib/types";

interface SmartInputProps {
  onSubmit: (input: string, inputType: InputType) => void;
  disabled?: boolean;
}

function detectType(input: string): { type: InputType; hint: string } {
  const trimmed = input.trim();
  if (!trimmed) return { type: "name", hint: "" };
  if (/^\d+$/.test(trimmed)) return { type: "agentId", hint: "Agent ID detected" };
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return { type: "address", hint: "Address detected" };
  if (trimmed.endsWith(".eth")) return { type: "ens", hint: "ENS name detected" };
  return { type: "name", hint: "Name search" };
}

export function SmartInput({ onSubmit, disabled }: SmartInputProps) {
  const [value, setValue] = useState("");
  const detected = detectType(value);

  const handleSubmit = useCallback(() => {
    if (!value.trim() || disabled) return;
    onSubmit(value.trim(), detected.type);
  }, [value, detected.type, disabled, onSubmit]);

  return (
    <div className="relative flex-1">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        placeholder="Enter Agent ID, address, or name..."
        disabled={disabled}
        className="w-full rounded-lg border border-border bg-surface-raised px-4 py-3 text-text-primary placeholder:text-text-secondary/50 focus:border-accent focus:outline-none disabled:opacity-50"
      />
      {detected.hint && value.trim() && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary">
          {detected.hint}
        </span>
      )}
    </div>
  );
}
