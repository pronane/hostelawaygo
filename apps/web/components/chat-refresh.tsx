"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Keeps the event chat roughly live without a socket. */
export function ChatRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);

  return null;
}
