"use client";

import { useEffect, useState } from "react";
import type { Artwork } from "@/lib/catalog-types";
import { artworkThumbUrl, artworkTypeChip } from "@/lib/artwork-thumb";

type Props = {
  art: Pick<
    Artwork,
    "type" | "urlWall" | "urlFull" | "urlPoster" | "modelUrl"
  >;
  className?: string;
  sizeClassName?: string;
};

/** Shared admin list/palette thumbnail — never renders empty black img. */
export function ArtworkThumb({
  art,
  className = "",
  sizeClassName = "h-14 w-14",
}: Props) {
  const preferred = artworkThumbUrl(art);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [preferred]);

  const showImg = Boolean(preferred) && !broken;

  return (
    <div
      className={`${sizeClassName} shrink-0 overflow-hidden bg-[#0e0c0a] ${className}`}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preferred}
          alt=""
          className="pointer-events-none h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[0.65rem] text-[var(--paper-dim)]">
          {artworkTypeChip(art.type)}
        </div>
      )}
    </div>
  );
}
