import type { Metadata } from "next";
import { LoginCallbackPage } from "@/screens/login-callback";

export const metadata: Metadata = {
  title: "로그인 확인",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <LoginCallbackPage />;
}
