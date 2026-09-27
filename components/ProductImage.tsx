"use client";

import Image from "next/image";
import { useState } from "react";

/** 정사각 크롭. 로딩 실패 시 회색 placeholder */
export function ProductImage({
  src,
  alt,
  sizes = "(max-width: 448px) 100vw, 448px",
  className = "",
  priority = false,
}: {
  src: string;
  alt: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`relative aspect-square w-full overflow-hidden rounded-2xl bg-gray-200 ${className}`}>
      {!failed && src && (
        <Image
          key={src}
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
