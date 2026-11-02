// One tap to mute a game (sound effects and music together), one tap to bring both back. The separate switches
// stay in Settings.
import { Volume2, VolumeX } from "lucide-react";
import { setSettings, useSettings } from "@/lib/settings";

export function SoundToggle() {
  const { sound, music } = useSettings();
  const on = sound || music;
  return (
    <button
      type="button"
      aria-label={on ? "Mute sound" : "Turn sound on"}
      aria-pressed={!on}
      onClick={() => setSettings(on ? { sound: false, music: false } : { sound: true, music: true })}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-card text-secondary"
    >
      {on ? <Volume2 className="h-5 w-5" aria-hidden /> : <VolumeX className="h-5 w-5" aria-hidden />}
    </button>
  );
}
