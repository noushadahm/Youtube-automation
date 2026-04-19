"use client";

import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Short one-line description shown under the title. */
  description?: string;
  /** Optional bulleted list of concrete consequences (what will be deleted etc.). */
  bullets?: string[];
  /** Extra cautionary note shown below the bullets. */
  danger?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive = red accent; default = cyan accent. */
  variant?: "default" | "destructive";
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Themed confirm dialog. Replaces `window.confirm()` everywhere so destructive
 * actions feel trustworthy instead of system-popup-jank.
 *
 * Usage:
 *   const [open, setOpen] = useState(false);
 *   <ConfirmDialog
 *     open={open}
 *     variant="destructive"
 *     title="Delete 'My Project'?"
 *     bullets={["the project and its 12 scenes", "all narration audio"]}
 *     danger="This cannot be undone."
 *     onConfirm={() => { doDelete(); setOpen(false); }}
 *     onCancel={() => setOpen(false)}
 *   />
 */
export function ConfirmDialog({
  open,
  title,
  description,
  bullets,
  danger,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  busy = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  // Close on Escape, confirm on Enter (when not typing in an input).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (busy) return;
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") void onConfirm();
    }
    window.addEventListener("keydown", onKey);
    // Lock background scroll while the modal is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, busy, onCancel, onConfirm]);

  if (!open) return null;

  const accent =
    variant === "destructive"
      ? { ring: "ring-red-500/30", icon: "text-red-300", btn: "bg-red-500 hover:bg-red-400 text-white" }
      : { ring: "ring-cyan-400/30", icon: "text-cyan-300", btn: "" };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (busy) return;
        if (e.target === e.currentTarget) onCancel();
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        className={`w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl ring-1 ${accent.ring}`}
      >
        <div className="flex items-start gap-3 p-5">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              variant === "destructive" ? "bg-red-500/10" : "bg-cyan-500/10"
            }`}
          >
            <AlertTriangle className={`h-5 w-5 ${accent.icon}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-white">{title}</h3>
            {description ? (
              <p className="mt-1 text-sm text-slate-300">{description}</p>
            ) : null}
            {bullets && bullets.length > 0 ? (
              <ul className="mt-3 space-y-1 rounded-lg border border-white/5 bg-white/[0.03] p-3 text-xs text-slate-300">
                {bullets.map((b, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-slate-500">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {danger ? (
              <p
                className={`mt-3 text-xs font-medium ${
                  variant === "destructive" ? "text-red-300" : "text-amber-200"
                }`}
              >
                {danger}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-white/5 hover:text-white disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex justify-end gap-2 border-t border-white/10 bg-black/30 px-5 py-3">
          <Button variant="outline" size="sm" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            size="sm"
            disabled={busy}
            className={accent.btn}
            onClick={() => void onConfirm()}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
