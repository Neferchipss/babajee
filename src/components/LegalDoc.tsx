import { Placeholder } from "./Page";

export default function LegalDoc({ sections }: { sections: string[] }) {
  return (
    <div className="space-y-10">
      {sections.map((heading) => (
        <section key={heading} aria-labelledby={heading}>
          <h2 id={heading} className="mb-3 text-2xl sm:text-3xl">
            {heading}
          </h2>
          <Placeholder>Text pending review by the store&apos;s legal adviser.</Placeholder>
        </section>
      ))}
    </div>
  );
}
