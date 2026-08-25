import Image from "next/image";
import Link from "next/link";
import { ROUTES } from "../../lib/routes";

// Hiển thị giao diện brand.
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href={ROUTES.home}
      className={`brand${compact ? " brand--compact" : ""}`}
      aria-label="Trang chủ DocuMind"
    >
      <Image src="/Logo.png" alt="" width={42} height={42} priority />
      <span>DocuMind</span>
    </Link>
  );
}
