import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "@/features/auth/login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <LoginForm />
    </div>
  );
}
