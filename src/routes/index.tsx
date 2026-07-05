import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import HUD from "@/components/HUD";

const GameCanvas = lazy(() => import("@/components/GameCanvas"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Iron Hero: Sky Assault — 3D Endless Flight Shooter" },
      { name: "description", content: "Pilot a red armored hero through a futuristic city. Destroy enemy drones, collect fuel, and chase the high score in this browser 3D flight shooter." },
      { property: "og:title", content: "Iron Hero: Sky Assault" },
      { property: "og:description", content: "3D endless flying action game — shoot, boost, survive." },
    ],
  }),
  component: GamePage,
});

function GamePage() {
  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black select-none">
      <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center text-white/60">Loading engine…</div>}>
        <GameCanvas />
      </Suspense>
      <HUD />
    </main>
  );
}
