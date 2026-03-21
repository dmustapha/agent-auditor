"use client";

import { useEffect, useRef, useState } from "react";
import type { ChainId } from "@/lib/types";

interface ChainSelectorProps {
  value: ChainId | "all";
  onChange: (chain: ChainId | "all") => void;
  disabled?: boolean;
}

const CHAIN_OPTIONS: { value: ChainId | "all"; label: string }[] = [
  { value: "all", label: "All Chains" },
  { value: "base", label: "Base" },
  { value: "gnosis", label: "Gnosis" },
  { value: "ethereum", label: "Ethereum" },
  { value: "arbitrum", label: "Arbitrum" },
  { value: "optimism", label: "Optimism" },
  { value: "polygon", label: "Polygon" },
];

function getLabel(value: ChainId | "all"): string {
  return CHAIN_OPTIONS.find((o) => o.value === value)?.label ?? "All Chains";
}

export function ChainSelector({ value, onChange, disabled }: ChainSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(optionValue: ChainId | "all") {
    onChange(optionValue);
    setIsOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setIsOpen(false);
      return;
    }

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setFocusedIndex(CHAIN_OPTIONS.findIndex((o) => o.value === value));
        return;
      }
      if (focusedIndex >= 0) {
        handleSelect(CHAIN_OPTIONS[focusedIndex].value);
      }
      return;
    }

    if (!isOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, CHAIN_OPTIONS.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, 0));
    }
  }

  return (
    <div className="aa-chain-wrapper" ref={wrapperRef} onKeyDown={handleKeyDown}>
      <input type="hidden" id="chain-select" name="chain" value={value} />
      <button
        type="button"
        className={`aa-chain-trigger${isOpen ? " aa-chain-trigger--open" : ""}`}
        onClick={() => {
          if (!disabled) {
            setIsOpen((prev) => !prev);
            setFocusedIndex(CHAIN_OPTIONS.findIndex((o) => o.value === value));
          }
        }}
        disabled={disabled}
        aria-label="Select blockchain network"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        {getLabel(value)}
        <svg
          className="aa-chain-chevron"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <ul className="aa-chain-dropdown" role="listbox" aria-label="Chain options">
          {CHAIN_OPTIONS.map((opt, i) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={`aa-chain-option${opt.value === value ? " aa-chain-option--active" : ""}${i === focusedIndex ? " aa-chain-option--focused" : ""}`}
              onMouseEnter={() => setFocusedIndex(i)}
              onClick={() => handleSelect(opt.value)}
            >
              <span>{opt.label}</span>
              {opt.value === value && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9070d4" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
