/**
 * Brand mark. Default: ink variant on light, white variant when the OS prefers dark — chosen by the browser
 * from <picture>, so there is no JS and no flash. Pass `variant` to force one (e.g. on a fixed-colour surface).
 */
export function Logo({ alt, size = 64, variant }: { alt: string; size?: number; variant?: "ink" | "white" }) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- <picture> needs a plain <img>; the PNGs are small brand assets
    <img src={`/brand/yws-lab-${variant ?? "ink"}.png`} alt={alt} width={size} height={size} decoding="async" style={{ height: "auto" }} />
  );
  if (variant) return img;
  return (
    <picture>
      <source media="(prefers-color-scheme: dark)" srcSet="/brand/yws-lab-white.png" />
      {img}
    </picture>
  );
}
