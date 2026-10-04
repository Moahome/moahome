import type { Metadata } from "next";
import { LoginPage } from "@/screens/login";

export const metadata: Metadata = {
  title: "로그인",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string | string[];
  }>;
}) {
  const { error } = await searchParams;

  return (
    <LoginPage
      errorCode={typeof error === "string" ? error : undefined}
    />
  );
}
