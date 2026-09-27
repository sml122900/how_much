"use client";

import { useEffect, useState } from "react";
import { isMuted, setMuted } from "@/lib/sfx";

export function MuteToggle() {
  const [muted, setState] = useState(false);
  useEffect(() => setState(isMuted()), []);
  return (
    <button
      type="button"
      aria-label={muted ? "소리 켜기" : "소리 끄기"}
      aria-pressed={muted}
      className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full text-lg active:bg-gray-100"
      onClick={() => {
        setMuted(!muted);
        setState(!muted);
      }}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
