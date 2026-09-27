import { DISCLOSURE } from "@/lib/config";

export function Disclosure({ className = "" }: { className?: string }) {
  return <p className={`text-center text-[11px] leading-snug text-gray-400 ${className}`}>{DISCLOSURE}</p>;
}
