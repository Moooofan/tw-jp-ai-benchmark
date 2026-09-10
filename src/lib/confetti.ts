const COLORS = ["#E8322B", "#141210", "#FFFFFF", "#1F5FD8", "#F5C400"];

export function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function confetti(anchor: Element | null): void {
  if (!anchor || reducedMotion()) return;
  const r = anchor.getBoundingClientRect();
  for (let i = 0; i < 18; i++) {
    const d = document.createElement("i");
    d.className = "confetti";
    d.style.left = `${r.left + r.width / 2}px`;
    d.style.top = `${r.top + 20}px`;
    d.style.background = COLORS[i % COLORS.length];
    d.style.setProperty("--dx", `${Math.random() * 240 - 120}px`);
    d.style.setProperty("--dy", `${Math.random() * 160 + 60}px`);
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1100);
  }
}
