import type { Metadata } from "next";
import AdminClient from "@/components/AdminClient";

export const metadata: Metadata = {
  title: "推爆東京",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return <AdminClient />;
}
