"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from "react";
import { categories, tools } from "@/lib/site";
import { cn } from "@/lib/cn";

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange"> & {
  label?: string;
};

const categoryNames = new Map(categories.map((category) => [category.slug, category.name]));

export function SearchInput({
  label = "Search tools",
  className,
  onBlur,
  onFocus,
  onKeyDown,
  ...props
}: SearchInputProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchRef = useRef<HTMLDivElement>(null);
  const previousPathnameRef = useRef(pathname);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const resultsId = useId();
  const normalizedQuery = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!normalizedQuery) return [];
    return tools
      .filter((tool) => tool.available && tool.href)
      .filter((tool) => {
        const categoryName = categoryNames.get(tool.category) ?? "";
        const searchable = [tool.name, tool.description, tool.category, categoryName, ...(tool.keywords ?? [])]
          .join(" ")
          .toLowerCase();
        return searchable.includes(normalizedQuery);
      })
      .slice(0, 8);
  }, [normalizedQuery]);

  const showResults = isOpen && normalizedQuery.length > 0;
  const activeOptionId =
    showResults && activeIndex >= 0 ? `${resultsId}-option-${activeIndex}` : undefined;

  function resetSearch() {
    setQuery("");
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => (current + 1) % results.length);
      return;
    }

    if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => (current <= 0 ? results.length - 1 : current - 1));
      return;
    }

    if (event.key === "Enter" && showResults && activeIndex >= 0) {
      const selectedResult = results[activeIndex];
      if (selectedResult?.href) {
        event.preventDefault();
        resetSearch();
        router.push(selectedResult.href);
      }
      return;
    }

    if (event.key === "Escape" && showResults) {
      event.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  useEffect(() => {
    if (previousPathnameRef.current !== pathname) {
      previousPathnameRef.current = pathname;
      resetSearch();
    }
  }, [pathname]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!searchRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (activeIndex >= results.length) {
      setActiveIndex(-1);
    }
  }, [activeIndex, results.length]);

  return (
    <div className="search-control" ref={searchRef}>
      <label className={cn("search-input", className)}>
        <span className="sr-only">{label}</span>
        <span className="search-icon" aria-hidden="true" />
        <input
          type="search"
          role="combobox"
          placeholder="Search tools"
          aria-label={label}
          aria-autocomplete="list"
          aria-controls={resultsId}
          aria-expanded={showResults}
          aria-activedescendant={activeOptionId}
          aria-haspopup="listbox"
          value={query}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setIsOpen(nextQuery.trim().length > 0);
            setActiveIndex(-1);
          }}
          onFocus={(event) => {
            onFocus?.(event);
            if (query.trim()) setIsOpen(true);
          }}
          onBlur={(event) => {
            onBlur?.(event);
            if (!searchRef.current?.contains(event.relatedTarget as Node | null)) {
              setIsOpen(false);
              setActiveIndex(-1);
            }
          }}
          onKeyDown={handleKeyDown}
          {...props}
        />
        <kbd aria-hidden="true">/</kbd>
      </label>

      {showResults && (
        <div
          id={resultsId}
          className="search-results"
          role="listbox"
          tabIndex={-1}
          aria-label="Tool search results"
        >
          {results.length > 0 ? (
            results.map((tool, index) => (
              <Link
                key={tool.name}
                id={`${resultsId}-option-${index}`}
                href={tool.href!}
                role="option"
                aria-selected={index === activeIndex}
                className={cn(index === activeIndex && "is-active")}
                tabIndex={-1}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={resetSearch}
              >
                <strong>{tool.name}</strong>
                <span>
                  {tool.description}
                </span>
              </Link>
            ))
          ) : (
            <p className="search-empty">
              No tools found
            </p>
          )}
        </div>
      )}
    </div>
  );
}
