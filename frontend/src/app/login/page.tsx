import { AuthForm } from "@/features/auth/auth-form";
import { logIn } from "@/features/auth/actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <AuthForm title="Log in" action={logIn} error={error} switchText="Need an account? Sign up" switchHref="/signup" />;
}
