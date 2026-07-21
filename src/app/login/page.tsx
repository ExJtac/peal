import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole } from "@/lib/roles";
import { LoginForm } from "@/features/auth/login-form";

export default async function LoginPage() {
  const current = await getCurrentUser();
  if (current) redirect(homeForRole(current.role));
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <LoginForm />
    </div>
  );
}
