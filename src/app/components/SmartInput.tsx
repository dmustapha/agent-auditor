"use client";

import type { InputType } from "@/lib/types";

interface SmartInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}

export function detectInputType(input: string): { type: InputType; hint: string } {
  const trimmed = input.trim();
  if (!trimmed) return { type: "name", hint: "" };
  if (/^\d+$/.test(trimmed)) return { type: "agentId", hint: "Agent ID" };
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return { type: "address", hint: "Address" };
  if (trimmed.endsWith(".eth")) return { type: "ens", hint: "ENS" };
  return { type: "name", hint: "Name" };
}

export function SmartInput({ value, onChange, onSubmit, disabled }: SmartInputProps) {
  const detected = detectInputType(value);

  return (
    <div className="aa-input-wrapper" style={{ flex: 1 }}>
      <input
        id="agent-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        placeholder="Enter Agent ID, address, or ENS name"
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        aria-label="Agent identifier"
        className="aa-smart-input"
      />
      {detected.hint && value.trim() && (
        <span className="aa-hint-badge" aria-live="polite">
          {detected.hint}
        </span>
      )}
    </div>
  );
}
