// Small shared UI atoms used by the route components.

export const inputClass =
  "w-full bg-stone-900 border-2 border-stone-700 px-3 py-2 text-sm focus:outline-none focus:border-amber-500";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-stone-300 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-stone-500 mt-1">{hint}</p>}
    </div>
  );
}

/**
 * A small swatch for a role's color. Discord serializes "no color" as
 * "#000000", which would render as a black square; show a faded stone tone
 * instead so the no-color state reads as muted rather than black.
 */
export function RoleSwatch({ color }: { color: string }) {
  const isUnset = color === "#000000" || !color;
  return (
    <span
      className="inline-block w-2.5 h-2.5 shrink-0 border border-stone-700"
      style={{ backgroundColor: isUnset ? "#57534e" : color }}
      aria-hidden
    />
  );
}
