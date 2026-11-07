import { AuthForm } from "@/features/auth/auth-form";
import { signUp } from "@/features/auth/actions";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <AuthForm title="Sign up" action={signUp} error={error} switchText="Have an account? Log in" switchHref="/login" />;
}
