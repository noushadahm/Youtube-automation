import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoginForm } from "./form";

export default function LoginPage({
  searchParams
}: {
  searchParams: { next?: string; error?: string };
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-3xl">Welcome back</CardTitle>
        <CardDescription>Sign in to continue to StoryFlow Studio.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm next={searchParams.next ?? "/"} initialError={searchParams.error} />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-cyan-300 hover:underline">
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
