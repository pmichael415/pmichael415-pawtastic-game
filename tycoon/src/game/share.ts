// Personalized score card rendered to canvas, shared via Web Share / download / copy.
export type CardData = { title: string; big: string; lines: string[]; link: string; logoUrl: string };

function loadImg(src: string) {
  return new Promise<HTMLImageElement | null>((res) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });
}

export async function renderCard(d: CardData): Promise<Blob | null> {
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1080;
  const g = c.getContext("2d");
  if (!g) return null;
  const grad = g.createLinearGradient(0, 0, 1080, 1080);
  grad.addColorStop(0, "#0057A7");
  grad.addColorStop(1, "#102c49");
  g.fillStyle = grad;
  g.fillRect(0, 0, 1080, 1080);
  g.fillStyle = "rgba(255,255,255,0.07)";
  for (let i = 0; i < 14; i++) {
    g.beginPath();
    g.arc((i * 173) % 1080, (i * 311) % 1080, 40, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.roundRect(80, 80, 920, 920, 60);
  g.fill();
  const logo = await loadImg(d.logoUrl);
  if (logo) g.drawImage(logo, 440, 110, 200, 200);
  g.textAlign = "center";
  g.fillStyle = "#102c49";
  g.font = "700 56px 'DM Sans', system-ui, sans-serif";
  g.fillText(d.title, 540, 380);
  g.fillStyle = "#0057A7";
  g.font = "700 180px 'DM Sans', system-ui, sans-serif";
  g.fillText(d.big, 540, 580);
  g.fillStyle = "#102c49";
  g.font = "700 40px 'DM Sans', system-ui, sans-serif";
  d.lines.forEach((l, i) => g.fillText(l, 540, 680 + i * 60));
  g.fillStyle = "#0057A7";
  g.font = "700 30px 'DM Sans', system-ui, sans-serif";
  g.fillText("PAWtastic Tycoon · free to play", 540, 930);
  return new Promise((res) => {
    try {
      c.toBlob((b) => res(b), "image/png");
    } catch {
      res(null); // tainted canvas fallback
    }
  });
}

export type ShareOutcome = "shared" | "downloaded" | "copied" | "cancelled" | "failed";

export async function shareCard(d: CardData, text: string): Promise<ShareOutcome> {
  const blob = await renderCard(d);
  const file = blob ? new File([blob], "pawtastic-card.png", { type: "image/png" }) : null;
  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text, url: d.link });
      return "shared";
    }
    if (navigator.share) {
      await navigator.share({ text, url: d.link });
      return "shared";
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return "cancelled";
  }
  if (blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pawtastic-card.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  try {
    await navigator.clipboard.writeText(`${text} ${d.link}`);
    return blob ? "downloaded" : "copied";
  } catch {
    return blob ? "downloaded" : "failed";
  }
}

export const SHARE_LINES = [
  "My pups are living their best lives 🐾",
  "Zero baths skipped. Maximum tail wags.",
  "Running the waggiest daycare in town!",
  "Certified Top Dog of daycare management.",
];
