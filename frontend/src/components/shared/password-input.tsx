"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  showStrength?: boolean;
  matchValue?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

function getStrength(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { score, label: "Faible" };
  if (score <= 3) return { score, label: "Moyen" };
  return { score, label: "Fort" };
}

export function PasswordInput({
  value,
  onChange,
  placeholder = "Mot de passe",
  showStrength = false,
  matchValue,
  id,
  disabled,
  className,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  const strength = showStrength && value ? getStrength(value) : null;
  const mismatch = matchValue !== undefined && value && value !== matchValue;

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn("pr-10", className)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-full w-10 hover:bg-transparent"
          onClick={() => setVisible(!visible)}
          tabIndex={-1}
        >
          {visible ? (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Eye className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>

      {strength && (
        <div className="space-y-1">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i <= strength.score
                    ? strength.score <= 2
                      ? "bg-beac-rouge"
                      : strength.score <= 3
                        ? "bg-beac-or"
                        : "bg-beac-vert"
                    : "bg-muted"
                )}
              />
            ))}
          </div>
          <p
            className={cn(
              "text-xs",
              strength.score <= 2
                ? "text-beac-rouge"
                : strength.score <= 3
                  ? "text-beac-or"
                  : "text-beac-vert"
            )}
          >
            {strength.label}
          </p>
        </div>
      )}

      {mismatch && (
        <p className="text-xs text-beac-rouge">
          Les mots de passe ne correspondent pas
        </p>
      )}
    </div>
  );
}
