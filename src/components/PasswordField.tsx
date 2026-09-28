"use client";

import { useState } from "react";
import { IconEye, IconEyeOff } from "./Icons";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  disabled?: boolean;
};

export default function PasswordField({
  label,
  value,
  onChange,
  autoComplete = "current-password",
  required,
  minLength,
  disabled,
}: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <label>
      {label}
      <span className="pw-wrap">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          disabled={disabled}
        />
        <button
          className="pw-toggle"
          type="button"
          tabIndex={-1}
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <IconEyeOff size={18} /> : <IconEye size={18} />}
        </button>
      </span>
    </label>
  );
}
