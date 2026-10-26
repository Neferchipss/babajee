"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// on to the product's shelf, with its sheet open (and out of the history,
// so Back does not land here again)
export default function OpenInShelf({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(href);
  }, [href, router]);
  return (
    <p className="sr-only" role="status">
      Opening the product…
    </p>
  );
}
