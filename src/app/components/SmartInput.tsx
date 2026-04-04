"use client";

import type { RefObject } from "react";
import type { InputType } from "@/lib/types";

interface SmartInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
}

export function detectInputType(input: string): { type: InputType; hint: string } {
  const trimmed = input.trim();
  if (!trimmed) return { type: "name", hint: "" };
  if (/^\d+$/.test(trimmed)) return { type: "agentId", hint: "Agent ID" };
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return { type: "address", hint: "Address" };
  if (trimmed.startsWith("0x") && !/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return { type: "address", hint: "Invalid address" };
  if (trimmed.endsWith(".eth")) return { type: "ens", hint: "ENS" };
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) return { type: "address", hint: "Solana Address" };
  return { type: "name", hint: "Name" };
}

export function SmartInput({ value, onChange, onSubmit, disabled, inputRef }: SmartInputProps) {
  const detected = detectInputType(value);
  const isInvalid = detected.hint === "Invalid address";

  return (
    <div className="aa-input-wrapper">
      <input
        ref={inputRef}
        id="agent-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        placeholder="Enter Agent ID, address, or ENS name"
        maxLength={200}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        aria-label="Agent identifier"
        aria-invalid={isInvalid || undefined}
        aria-describedby={isInvalid ? "input-error" : undefined}
        className={`aa-smart-input${isInvalid ? ' aa-smart-input--invalid' : ''}`}
      />
      {detected.hint && value.trim() && (
        <span className="aa-hint-badge" aria-live="polite">
          {detected.hint}
        </span>
      )}
      {isInvalid && (
        <span id="input-error" className="aa-input-error" role="alert">
          Must be 0x + 40 hex characters
        </span>
      )}
    </div>
  );
}
