type PageShellProps = {
  title: string;
  sow: string;
  children?: React.ReactNode;
};

export default function PageShell({ title, sow, children }: PageShellProps) {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-16">
      <p className="text-xs uppercase tracking-widest text-neutral-500">
        {sow}
      </p>
      <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
      <div className="mt-8 border-t border-neutral-800 pt-8">
        {children ?? (
          <p className="text-neutral-500">Placeholder — not built yet.</p>
        )}
      </div>
    </div>
  );
}
