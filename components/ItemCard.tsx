"use client";

import type { BrainItem } from "@/lib/types";
import { hasPlaceholderCategory } from "@/lib/analysis-shared";

export function ItemCard({
  item,
  onClick,
  onExpand,
  selectMode = false,
  selected = false,
  onToggleSelect,
  view = "detail",
}: {
  item: BrainItem;
  onClick: () => void;
  onExpand?: () => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  view?: "detail" | "grid";
}) {
  const activate = selectMode ? onToggleSelect : onClick;
  const compact = view === "grid";
  const analyzing = item.analysis_status === "pending";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate?.();
        }
      }}
      className={`group relative cursor-pointer text-left transition-colors duration-150 ${
        compact
          ? `overflow-hidden border ${selected ? "border-accent" : "border-transparent hover:border-accent"}`
          : `flex flex-col border bg-surface hover:bg-surface-hover ${selected ? "border-accent" : "border-border"}`
      }`}
    >
      {selectMode && (
        <span
          className={`absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center border text-[11px] leading-none ${
            selected
              ? "border-accent bg-accent text-bg"
              : "border-border bg-bg/80 text-transparent"
          }`}
        >
          ✓
        </span>
      )}

      <div
        className={`relative w-full overflow-hidden bg-bg ${
          compact ? "aspect-square" : "aspect-[4/3] border-b border-border cursor-zoom-in"
        }`}
        onClick={
          !compact && !selectMode && onExpand
            ? (e) => {
                // In detail view, the photo opens fullscreen directly — stop
                // the click from bubbling to the card's own handler, which
                // opens the side-by-side detail view instead.
                e.stopPropagation();
                onExpand();
              }
            : undefined
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/uploads/${item.filename}/thumb?w=${compact ? 440 : 640}`}
          alt={item.title}
          loading="lazy"
          decoding="async"
          className={`h-full w-full object-cover ${compact ? "transition-transform duration-150 group-hover:scale-105" : ""}`}
        />
        {compact && analyzing && (
          <span className="absolute bottom-1 left-1 flex items-center gap-1 bg-bg/80 px-1.5 py-0.5">
            <span className="h-1.5 w-1.5 animate-pulse bg-accent" />
            <span className="tracked-label text-accent">Analyzing</span>
          </span>
        )}
        {compact && !selectMode && onExpand && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExpand();
            }}
            title="View full screen"
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center border border-border bg-bg/80 text-muted opacity-0 transition-opacity duration-150 hover:text-accent group-hover:opacity-100 focus-visible:opacity-100"
          >
            <ExpandIcon />
          </button>
        )}
      </div>

      {!compact && (
        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="card-title line-clamp-1">{item.title}</h3>
          </div>
          {analyzing ? (
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse bg-accent" />
              <p className="tracked-label text-accent">Analyzing…</p>
            </div>
          ) : (
            <>
              {!hasPlaceholderCategory(item) && (
                <p className="tracked-label text-dim">{item.category}</p>
              )}
              {item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {item.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="tracked-label border border-border px-1.5 py-0.5 text-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ExpandIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4" />
    </svg>
  );
}
