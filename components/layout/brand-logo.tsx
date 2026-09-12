import Image from "next/image";

// Keep the supplied mark in one place so every page uses the same branding.
export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/logo-transparent.png"
      alt=""
      width={1233}
      height={1275}
      unoptimized
      className={`h-10 w-auto shrink-0 ${className}`}
    />
  );
}
