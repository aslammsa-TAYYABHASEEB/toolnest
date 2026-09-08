"use client";

import Link from "next/link";
import { useId, useMemo, useState, type InputHTMLAttributes } from "react";
import { categories, tools } from "@/lib/site";
import { cn } from "@/lib/cn";

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange"> & {
  label?: string;
};

const categoryNames = new Map(categories.map((category) => [category.slug, category.name]));

export function SearchInput({ label = "Search tools", className, ...props }: SearchInputProps) {
  const [query, setQuery] = useState("");
  const resultsId = useId();
  const normalizedQuery = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!normalizedQuery) return [];
    return tools
      .filter((tool) => tool.available && tool.href)
      .filter((tool) => {
        const categoryName = categoryNames.get(tool.category) ?? "";
        const searchable = [tool.name, tool.description, tool.category, categoryName]
          .join(" ")
          .toLowerCase();
        return searchable.includes(normalizedQuery);
      })
      .slice(0, 8);
  }, [normalizedQuery]);

  const showResults = normalizedQuery.length > 0;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <label className={cn("search-input", className)}>
        <span className="sr-only">{label}</span>
        <span className="search-icon" aria-hidden="true" />
        <input
          type="search"
          placeholder="Search tools"
          aria-label={label}
          aria-controls={showResults ? resultsId : undefined}
          aria-expanded={showResults}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          {...props}
        />
        <kbd aria-hidden="true">/</kbd>
      </label>

      {showResults && (
        <div
          id={resultsId}
          className="nav-dropdown-menu"
          role="list"
          aria-label="Tool search results"
          style={{
            top: "calc(100% + .5rem)",
            left: 0,
            right: "auto",
            width: "100%",
            minWidth: "16rem",
            maxHeight: "20rem",
            overflowY: "auto",
            zIndex: 60,
          }}
        >
          {results.length > 0 ? (
            results.map((tool) => (
              <Link key={tool.name} href={tool.href!} role="listitem">
                <strong style={{ display: "block" }}>{tool.name}</strong>
                <span style={{ display: "block", marginTop: ".15rem", fontSize: ".75rem", fontWeight: 500, color: "var(--color-text-muted)" }}>
                  {tool.description}
                </span>
              </Link>
            ))
          ) : (
            <p style={{ margin: 0, padding: ".65rem .7rem", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
              No tools found
            </p>
          )}
        </div>
      )}
    </div>
  );
}
