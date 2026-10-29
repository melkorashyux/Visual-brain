"use client";

export function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field flex items-center gap-2 px-3 py-2">
      <span className="text-dim">/</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="search title, tags, notes..."
        className="w-full"
      />
    </div>
  );
}
