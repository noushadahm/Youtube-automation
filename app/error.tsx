"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-white">
      <div className="glass-panel max-w-md rounded-3xl p-8 text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-amber-300/80">Something failed</p>
        <h1 className="mt-3 font-display text-4xl">The studio hit an unexpected error.</h1>
        <p className="mt-4 text-sm text-muted-foreground">{error.message}</p>
        <Button className="mt-6" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
