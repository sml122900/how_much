export {};

declare global {
  interface Window {
    /** AdSlot이 ADS_ENABLED=true 일 때만 채운다 */
    adsbygoogle?: unknown[];
  }
}
