"use client";

import { useEffect, useRef, useState } from "react";
import { faviconUrl, isNameKey } from "@/lib/format";

/**
 * Company favicon via Google's s2 service as a plain <img>, with a neutral
 * initial square when it fails (also catches a failure that happened before
 * hydration attached the handler). A `name:` company (no official website
 * yet, v6n) always gets the initial square and never requests a favicon.
 */
export default function Favicon({
  domain,
  name,
  size = 28,
}: {
  domain: string;
  name: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, []);

  const style = { width: size, height: size };
  if (failed || isNameKey(domain)) {
    return (
      <span className="fav fav--none" style={style} aria-hidden="true">
        {(name.trim()[0] ?? "?").toUpperCase()}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={img}
      className="fav"
      src={faviconUrl(domain)}
      width={size}
      height={size}
      style={style}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
