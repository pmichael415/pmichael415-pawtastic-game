import logo from "@/assets/pawtastic-logo.png.asset.json";
import { BREEDS, FREE_COSMETICS } from "./engine";

export const LOGO_URL = logo.url;

export function Logo({ className = "h-10 w-auto" }: { className?: string }) {
  return (
    <span className="inline-flex shrink-0 rounded-2xl bg-secondary p-1 shadow-soft">
      <img src={logo.url} alt="PAWtastic Academy" className={className} width={115} height={108} />
    </span>
  );
}

export function bandanaColor(id: string | null) {
  return FREE_COSMETICS.find((c) => c.id === id)?.color;
}

/** Original side-view cartoon pup. */
export function DogSprite({ breed, size = 56, bandana, moving = true, collar = false, star = false }: { breed: number; size?: number; bandana?: string | undefined; moving?: boolean; collar?: boolean; star?: boolean }) {
  const b = BREEDS[breed % BREEDS.length]!;
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 70 56" aria-hidden className={moving ? "animate-hop" : ""}>
      <ellipse cx="35" cy="53" rx="22" ry="3" fill="oklch(0.27 0.06 252 / 0.18)" />
      <g className={moving ? "animate-wag" : ""} style={{ transformBox: "fill-box" }}>
        <path d="M14 30 Q4 20 8 14" stroke={b.ear} strokeWidth="5" fill="none" strokeLinecap="round" />
      </g>
      <rect x="16" y="38" width="6" height="13" rx="3" fill={b.ear} />
      <rect x="40" y="38" width="6" height="13" rx="3" fill={b.ear} />
      <ellipse cx="31" cy="34" rx="19" ry="12" fill={b.coat} />
      <rect x="22" y="40" width="6" height="12" rx="3" fill={b.coat} />
      <rect x="34" y="40" width="6" height="12" rx="3" fill={b.coat} />
      <circle cx="51" cy="22" r="12" fill={b.coat} />
      <ellipse cx="60" cy="26" rx="7" ry="5" fill={b.coat} />
      <circle cx="65" cy="24" r="2.5" fill="oklch(0.2 0.03 252)" />
      <circle cx="53" cy="19" r="2" fill="oklch(0.2 0.03 252)" />
      <path d="M43 13 Q40 26 46 29 Q48 20 47 13Z" fill={b.ear} />
      {bandana && <path d="M42 30 L56 31 L49 40Z" fill={bandana} />}
      {star && <path d="M49 32.5 l0.9 1.9 2 0.2 -1.5 1.3 0.5 2 -1.9 -1.1 -1.9 1.1 0.5 -2 -1.5 -1.3 2 -0.2Z" fill="oklch(0.98 0.01 250)" />}
      {collar && (
        <g>
          <path d="M41 28 Q49 32 57 29" stroke="oklch(0.47 0.16 255)" strokeWidth="3" fill="none" strokeLinecap="round" />
          <circle cx="49" cy="31.5" r="2.6" fill="oklch(0.47 0.16 255)" stroke="oklch(0.98 0.01 250)" strokeWidth="0.8" />
          <path d="M48 33 L46.5 38 L49 36.5 L51.5 38 L50 33Z" fill="oklch(0.47 0.16 255)" />
        </g>
      )}
    </svg>
  );
}

export function StaffSprite({ tired, name }: { tired: boolean; name: string }) {
  return (
    <div className="flex flex-col items-center">
      <svg width="34" height="46" viewBox="0 0 34 46" aria-hidden className={tired ? "" : "animate-hop"}>
        <ellipse cx="17" cy="44" rx="11" ry="2" fill="oklch(0.27 0.06 252 / 0.18)" />
        <rect x="9" y="30" width="6" height="13" rx="3" fill="oklch(0.27 0.06 252)" />
        <rect x="19" y="30" width="6" height="13" rx="3" fill="oklch(0.27 0.06 252)" />
        <rect x="6" y="15" width="22" height="19" rx="8" fill="oklch(0.47 0.16 254)" />
        <circle cx="17" cy="10" r="8" fill="oklch(0.82 0.06 60)" />
        <path d="M9 8 Q17 0 25 8 Q17 5 9 8Z" fill="oklch(0.3 0.05 50)" />
        <path d="M13 22 h8" stroke="oklch(1 0 0)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="rounded-full bg-card/90 px-1.5 text-[10px] font-extrabold text-secondary">{tired ? "😮‍💨 " : ""}{name}</span>
    </div>
  );
}
