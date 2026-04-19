import { Bell, Search, LogOut } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { getCurrentUser } from "@/lib/auth";

export async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-background/70 px-8 py-5 backdrop-blur-xl">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/80">Production Dashboard</p>
        <h1 className="font-display text-3xl">StoryFlow Studio</h1>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative hidden w-80 md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-10" placeholder="Search projects, renders, or assets" />
        </div>
        <button className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
          <Bell className="h-4 w-4" />
        </button>
        {user ? (
          <div className="flex items-center gap-2">
            <Link
              href="/settings"
              className="hidden rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-muted-foreground hover:text-white md:inline-block"
            >
              {user.email}
            </Link>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 hover:text-white"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </header>
  );
}
