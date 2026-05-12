// Small shared UI atoms used by the route components.

export const inputClass =
  "w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

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
      <label className="block text-sm font-medium text-gray-300 mb-1">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

/**
 * A small colored swatch for a role color. Discord serializes a role's color
 * as "#000000" when no color is set, which would render as a black dot — show
 * a faded gray instead so it's clearly the "no color" state.
 */
export function RoleSwatch({ color }: { color: string }) {
  const isUnset = color === "#000000" || !color;
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
      style={{ backgroundColor: isUnset ? "#4b5563" : color }}
      aria-hidden
    />
  );
}
