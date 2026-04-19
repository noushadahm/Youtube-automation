import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignupForm } from "./form";

export default function SignupPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-3xl">Create your studio</CardTitle>
        <CardDescription>Spin up your StoryFlow workspace in seconds.</CardDescription>
      </CardHeader>
      <CardContent>
        <SignupForm />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-cyan-300 hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
