import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-start px-6 py-24">
      <p className="text-xs uppercase tracking-widest text-neutral-500">
        Landing hero page — SOW #1
      </p>
      <h1 className="mt-4 max-w-2xl text-5xl font-semibold tracking-tight">
        babajee
      </h1>
      <p className="mt-4 max-w-xl text-neutral-400">
        Hero placeholder. Visual direction (scroll treatment, imagery,
        typography) is a separate pass — this is routing/structure only.
      </p>
      <Link
        href="/shop"
        className="mt-8 rounded-full bg-white px-6 py-3 text-sm font-medium text-black"
      >
        Enter the shop
      </Link>
    </div>
  );
}
