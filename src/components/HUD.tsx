import { useEffect, useRef, useState } from "react";
import { useGame } from "@/lib/game-store";
import { touchControls } from "@/lib/touch-controls";
import { useFullscreen } from "@/lib/use-fullscreen";
import { gameAudio } from "@/lib/game-audio";

export default function HUD() {
  const { score, highScore, combo, fuel, health, fps, state, setState, reset } = useGame();
  const { toggle: toggleFullscreen } = useFullscreen();
  const [muted, setMuted] = useState(false);

  const toggleMusic = () => {
    const next = !muted;
    setMuted(next);
    gameAudio.setMasterVolume(next ? 0 : 0.6);
  };

  // Auto-enter fullscreen the moment the user first interacts with the page.
  // Browsers require a genuine user gesture to grant fullscreen, so we can't
  // do this purely on load — this listens for the very first click/tap/key
  // anywhere and fires fullscreen right then, only once.
  useEffect(() => {
    let done = false;
    const goFullscreen = () => {
      if (done || document.fullscreenElement) return;
      done = true;
      toggleFullscreen();
      window.removeEventListener("pointerdown", goFullscreen);
      window.removeEventListener("keydown", goFullscreen);
    };
    window.addEventListener("pointerdown", goFullscreen, { once: true });
    window.addEventListener("keydown", goFullscreen, { once: true });
    return () => {
      window.removeEventListener("pointerdown", goFullscreen);
      window.removeEventListener("keydown", goFullscreen);
    };
  }, [toggleFullscreen]);

  if (state === "menu") {
    return (
      <Overlay>
        <Panel>
          <h1 className="text-5xl font-black tracking-tight text-hero mb-2">IRON HERO</h1>
          <p className="text-hero-accent tracking-[0.4em] text-sm mb-8">SKY ASSAULT</p>
          <p className="text-white/70 mb-8 max-w-sm text-center text-sm leading-relaxed">
            Fly the armored hero through the city. Destroy drones, collect fuel, survive as long as possible.
          </p>
          <div className="flex flex-col gap-3 w-64">
            <HeroButton onClick={() => { gameAudio.init(); reset(); setState("playing"); }}>Start Game</HeroButton>
            <HeroButton variant="ghost" onClick={() => alert("WASD / Mouse to steer\nLeft click / J to shoot\nSpace to boost\nEsc to pause\n\nMobile: left half = joystick, right half = shoot, 3 fingers = boost")}>How to Play</HeroButton>
          </div>
          <p className="mt-8 text-xs text-white/40">High Score: <span className="text-hero-accent font-bold">{Math.floor(highScore)}</span></p>
        </Panel>
      </Overlay>
    );
  }

  if (state === "paused") {
    return (
      <Overlay>
        <Panel>
          <h2 className="text-3xl font-black text-hero mb-6">PAUSED</h2>
          <div className="flex flex-col gap-3 w-56">
            <HeroButton onClick={() => setState("playing")}>Resume</HeroButton>
            <HeroButton variant="ghost" onClick={() => { reset(); setState("playing"); }}>Restart</HeroButton>
            <HeroButton variant="ghost" onClick={() => setState("menu")}>Main Menu</HeroButton>
          </div>
        </Panel>
      </Overlay>
    );
  }

  if (state === "gameover") {
    return (
      <Overlay>
        <Panel>
          <h2 className="text-4xl font-black text-hero mb-2">MISSION FAILED</h2>
          <p className="text-white/60 text-sm mb-6">Your armor is offline.</p>
          <div className="grid grid-cols-2 gap-4 mb-6 text-center">
            <Stat label="Score" value={Math.floor(score)} />
            <Stat label="Best" value={Math.floor(highScore)} accent />
          </div>
          <div className="flex flex-col gap-3 w-56">
            <HeroButton onClick={() => { reset(); setState("playing"); }}>Play Again</HeroButton>
            <HeroButton variant="ghost" onClick={() => setState("menu")}>Main Menu</HeroButton>
          </div>
        </Panel>
      </Overlay>
    );
  }

  // Playing HUD
  return (
    <div className="pointer-events-none absolute inset-0 z-10 text-white">
      {/* Top bars */}
      <div className="absolute top-4 left-4 right-4 flex flex-col gap-2">
        <Bar label="FUEL" value={fuel} color="from-emerald-400 to-lime-300" />
        <Bar label="ARMOR" value={health} color="from-rose-500 to-orange-400" />
      </div>

      {/* Score */}
      <div className="absolute top-4 right-4 text-right pointer-events-none">
        <div className="glass px-4 py-2">
          <div className="text-[10px] tracking-widest text-white/50">SCORE</div>
          <div className="text-2xl font-black text-hero-accent leading-none">{Math.floor(score)}</div>
          <div className="text-[10px] text-white/40 mt-1">BEST {Math.floor(highScore)}</div>
        </div>
      </div>

      {/* Music toggle — row below score board, top right */}
      <div className="absolute top-[88px] right-4 flex gap-1 pointer-events-auto">
        <button
          className="glass px-3 py-2 text-sm font-semibold hover:text-hero-accent transition"
          onClick={toggleMusic}
          aria-label="Toggle music"
        >
          {muted ? "🔇" : "🔊"}
        </button>
      </div>

      {/* Combo */}
      {combo > 1 && (
        <div className="absolute top-36 right-4 glass px-3 py-1 text-right">
          <div className="text-[10px] tracking-widest text-white/50">COMBO</div>
          <div className="text-xl font-black text-hero">×{combo}</div>
        </div>
      )}

      {/* Crosshair */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-hero-accent/70 rounded-full" />
        <div className="absolute w-1 h-1 bg-hero-accent rounded-full" />
      </div>

      {/* FPS */}
      <div className="absolute bottom-4 left-4 text-[10px] text-white/40 font-mono">{fps} FPS</div>

      {/* On-screen controls — available on every device (mouse, touch, pen) */}
      <OnScreenControls />
    </div>
  );
}

function OnScreenControls() {
  return (
    <>
      <Joystick />
      <div className="absolute bottom-6 right-6 flex flex-col gap-3 items-end pointer-events-none">
        <ActionButton
          label="BOOST"
          className="bg-gradient-to-br from-amber-400 to-orange-500 text-black w-16 h-16 text-[10px]"
          onPress={(v) => (touchControls.boost = v)}
        />
        <ActionButton
          label="FIRE"
          className="bg-gradient-to-br from-red-500 to-red-700 text-white w-24 h-24 text-sm"
          onPress={(v) => (touchControls.shoot = v)}
        />
      </div>
    </>
  );
}

function ActionButton({
  label,
  className,
  onPress,
}: {
  label: string;
  className: string;
  onPress: (down: boolean) => void;
}) {
  return (
    <button
      className={`pointer-events-auto select-none rounded-full font-black tracking-widest shadow-[0_0_20px_-2px_rgba(239,68,68,0.6)] border border-white/20 active:scale-95 transition touch-none ${className}`}
      style={{ touchAction: "none" }}
      onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId); onPress(true); }}
      onPointerUp={() => onPress(false)}
      onPointerCancel={() => onPress(false)}
      onPointerLeave={(e) => { if (e.buttons === 0) return; onPress(false); }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

function Joystick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const activeId = useRef<number | null>(null);

  const update = (clientX: number, clientY: number) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const max = rect.width / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
    setKnob({ x: dx, y: dy });
    touchControls.x = dx / max;
    touchControls.y = dy / max;
  };

  const reset = () => {
    setKnob({ x: 0, y: 0 });
    touchControls.x = 0;
    touchControls.y = 0;
    activeId.current = null;
  };

  useEffect(() => () => reset(), []);

  return (
    <div
      ref={baseRef}
      className="absolute bottom-8 left-8 w-32 h-32 rounded-full bg-white/5 border border-white/20 backdrop-blur-sm pointer-events-auto"
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        activeId.current = e.pointerId;
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (activeId.current === e.pointerId) update(e.clientX, e.clientY);
      }}
      onPointerUp={reset}
      onPointerCancel={reset}
    >
      <div
        className="absolute top-1/2 left-1/2 w-14 h-14 -mt-7 -ml-7 rounded-full bg-gradient-to-br from-red-500 to-red-700 border border-white/30 shadow-[0_0_20px_-2px_rgba(239,68,68,0.8)]"
        style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
      />
    </div>
  );
}


function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      {children}
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass p-10 flex flex-col items-center max-w-lg animate-in fade-in zoom-in duration-300">
      {children}
    </div>
  );
}

function HeroButton({ children, onClick, variant = "primary" }: { children: React.ReactNode; onClick: () => void; variant?: "primary" | "ghost" }) {
  const base = "px-6 py-3 rounded-xl font-bold tracking-wide transition-all active:scale-95";
  const styles = variant === "primary"
    ? "bg-gradient-to-r from-red-600 to-red-500 text-white shadow-[0_0_25px_-5px_rgba(239,68,68,0.7)] hover:shadow-[0_0_35px_-3px_rgba(239,68,68,0.9)] hover:from-red-500 hover:to-red-400"
    : "border border-white/15 text-white/80 hover:text-white hover:border-hero-accent/60 hover:bg-white/5";
  return <button onClick={onClick} className={`${base} ${styles}`}>{children}</button>;
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="glass px-4 py-3">
      <div className="text-[10px] tracking-widest text-white/50">{label}</div>
      <div className={`text-2xl font-black ${accent ? "text-hero-accent" : "text-white"}`}>{value}</div>
    </div>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="glass px-3 py-2 w-64">
      <div className="flex justify-between text-[10px] tracking-widest text-white/60 mb-1">
        <span>{label}</span><span>{Math.round(value)}%</span>
      </div>
      <div className="h-2 bg-black/50 rounded-full overflow-hidden">
        <div className={`h-full bg-gradient-to-r ${color} transition-all duration-150`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}