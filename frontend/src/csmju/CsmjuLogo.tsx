import Image from "next/image";

const LOGO_ALT = "โลโก้ สาขาวิทยาการคอมพิวเตอร์ มหาวิทยาลัยแม่โจ้";

/** Full logo is unreadable below this width (ui-design-system.md §14.1). */
const MIN_WIDTH = 120;

export default function CsmjuLogo({
  width = MIN_WIDTH,
  framed = false,
  decorative = false,
  priority = false,
  className = "",
}: {
  /** Rendered width in px; clamped to the 120px minimum. */
  width?: number;
  /** Wrap in a white frame — required on brand-gradient or other dark surfaces. */
  framed?: boolean;
  /** Use when the system name is already shown as text next to the logo. */
  decorative?: boolean;
  priority?: boolean;
  className?: string;
}) {
  const renderWidth = Math.max(width, MIN_WIDTH);

  const logo = (
    <Image
      src="/csmju-logo.png"
      alt={decorative ? "" : LOGO_ALT}
      width={240}
      height={170}
      priority={priority}
      sizes={`${renderWidth}px`}
      style={{ maxWidth: renderWidth }}
      className={`h-auto w-full object-contain ${framed ? "" : className}`}
    />
  );

  if (!framed) return logo;

  return (
    <div
      className={`flex justify-center rounded-xl bg-white p-4 shadow-sm ${className}`}
    >
      {logo}
    </div>
  );
}
