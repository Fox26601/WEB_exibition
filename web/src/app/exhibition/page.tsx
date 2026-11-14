import { ExhibitionApp } from "@/components/exhibition/exhibition-app";
import { unityBuildPresent } from "@/lib/unity-build";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Exhibition — Atelier",
  robots: { index: false, follow: false },
};

export default function ExhibitionPage() {
  return <ExhibitionApp unityAvailable={unityBuildPresent()} />;
}
