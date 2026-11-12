// The words on an Add to cart button. Keyed by what they say, so a change
// (Add -> Added) is a fresh label that rises in (motion.css); once added, a
// tick draws itself in front of the word.
export default function AddLabel({ text, done }: { text: string; done?: boolean }) {
  return (
    <span key={text} className="add-label">
      {done && (
        <svg className="add-check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )}
      {text}
    </span>
  );
}
