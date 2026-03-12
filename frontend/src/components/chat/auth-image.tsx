"use client";

import { useEffect, useState } from "react";

interface AuthImageProps {
  src: string;
  alt: string;
  className?: string;
}

/**
 * Image component that fetches from authenticated API endpoints.
 * Uses blob URLs to display images that require JWT auth headers.
 */
export function AuthImage({ src, alt, className }: AuthImageProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let revoke: string | null = null;

    async function load() {
      const token = localStorage.getItem("access_token");
      try {
        const res = await fetch(src, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          setError(true);
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        revoke = url;
        setBlobUrl(url);
      } catch {
        setError(true);
      }
    }

    load();

    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [src]);

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 rounded-lg text-gray-400 text-xs ${className ?? ""}`} style={{ minHeight: 80 }}>
        Image indisponible
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div className={`animate-pulse bg-gray-200 rounded-lg ${className ?? ""}`} style={{ minHeight: 80 }} />
    );
  }

  return <img src={blobUrl} alt={alt} className={className} />;
}
