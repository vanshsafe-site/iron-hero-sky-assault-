import { create } from "zustand";

export type GameState = "menu" | "playing" | "paused" | "gameover";

interface Store {
  state: GameState;
  score: number;
  highScore: number;
  combo: number;
  fuel: number; // 0-100
  health: number; // 0-100
  fps: number;
  setState: (s: GameState) => void;
  setScore: (n: number) => void;
  addScore: (n: number) => void;
  setCombo: (n: number) => void;
  setFuel: (n: number) => void;
  setHealth: (n: number) => void;
  setFps: (n: number) => void;
  reset: () => void;
}

const HS_KEY = "iron-hero-highscore";

export const useGame = create<Store>((set, get) => ({
  state: "menu",
  score: 0,
  highScore: typeof window !== "undefined" ? Number(localStorage.getItem(HS_KEY) ?? 0) : 0,
  combo: 0,
  fuel: 100,
  health: 100,
  fps: 0,
  setState: (s) => {
    if (s === "gameover") {
      const { score, highScore } = get();
      if (score > highScore) {
        localStorage.setItem(HS_KEY, String(score));
        set({ highScore: score });
      }
    }
    set({ state: s });
  },
  setScore: (n) => set({ score: n }),
  addScore: (n) => set((st) => ({ score: st.score + n })),
  setCombo: (n) => set({ combo: n }),
  setFuel: (n) => set({ fuel: Math.max(0, Math.min(100, n)) }),
  setHealth: (n) => set({ health: Math.max(0, Math.min(100, n)) }),
  setFps: (n) => set({ fps: n }),
  reset: () => set({ score: 0, combo: 0, fuel: 100, health: 100 }),
}));
