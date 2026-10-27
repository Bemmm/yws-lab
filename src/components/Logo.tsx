import Image from "next/image";

export function Logo({ alt, size = 64, variant = "ink" }: { alt: string; size?: number; variant?: "ink" | "white" }) {
  return <Image src={`/brand/yws-lab-${variant}.png`} alt={alt} width={size} height={size} priority />;
}
