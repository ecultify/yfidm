import type { Metadata } from "next";
import { Brand24App } from "@/components/brand24/brand24-app";

export const metadata: Metadata = {
  title: "Brand24 — Alerts",
};

export default function Brand24Page() {
  return (
    <main className="h-dvh overflow-hidden">
      <Brand24App />
    </main>
  );
}
