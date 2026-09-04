import { generateCaptcha } from "@/lib/captcha";
import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  // Directly generated on the server at initial SSR render (NO XHR / Client fetch required!)
  const initialCaptcha = generateCaptcha();

  return <LoginForm initialCaptcha={initialCaptcha} />;
}
