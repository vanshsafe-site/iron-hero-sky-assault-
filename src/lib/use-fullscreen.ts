// src/lib/use-fullscreen.ts
import { useCallback, useEffect, useState } from "react";

// Cross-browser fullscreen helpers (Safari/iOS uses webkit-prefixed APIs).
function getFullscreenElement(): Element | null {
  return (
    document.fullscreenElement ||
    (document as any).webkitFullscreenElement ||
    (document as any).msFullscreenElement ||
    null
  );
}

async function requestFullscreen(el: HTMLElement) {
  const anyEl = el as any;
  if (el.requestFullscreen) return el.requestFullscreen();
  if (anyEl.webkitRequestFullscreen) return anyEl.webkitRequestFullscreen();
  if (anyEl.msRequestFullscreen) return anyEl.msRequestFullscreen();
}

async function exitFullscreen() {
  const anyDoc = document as any;
  if (document.exitFullscreen) return document.exitFullscreen();
  if (anyDoc.webkitExitFullscreen) return anyDoc.webkitExitFullscreen();
  if (anyDoc.msExitFullscreen) return anyDoc.msExitFullscreen();
}

export function useFullscreen(targetRef?: React.RefObject<HTMLElement>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!getFullscreenElement());
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    document.addEventListener("MSFullscreenChange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
      document.removeEventListener("MSFullscreenChange", onChange);
    };
  }, []);

  const toggle = useCallback(async () => {
    const el = targetRef?.current ?? document.documentElement;
    try {
      if (getFullscreenElement()) {
        await exitFullscreen();
      } else {
        await requestFullscreen(el);
        // Try to lock landscape on mobile for a more immersive flight-sim feel.
        // Silently ignored on browsers/devices that don't support it.
        const orientation = (screen as any).orientation;
        if (orientation?.lock) {
          try {
            await orientation.lock("portrait");
          } catch {
            /* not supported / not allowed — ignore */
          }
        }
      }
    } catch {
      /* fullscreen request rejected (e.g. not a user gesture) — ignore */
    }
  }, [targetRef]);

  return { isFullscreen, toggle };
}