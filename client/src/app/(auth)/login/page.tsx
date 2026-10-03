import type { Metadata } from "next";
import { LoginPage } from "@/_pages/login";

export const metadata: Metadata = {
  title: "로그인",
};

export default function Page() {
  return <LoginPage />;
}
