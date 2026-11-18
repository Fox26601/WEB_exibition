import { ExhibitionApp } from "@/components/exhibition/exhibition-app";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Exhibition — Atelier",
  robots: { index: false, follow: false },
};

export default function ExhibitionPage() {
  return <ExhibitionApp />;
}
