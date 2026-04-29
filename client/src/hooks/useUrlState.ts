import { useCallback, useEffect, useState } from "react";

/**
 * Persist a piece of UI state in the URL query string.
 *
 * Useful for filters/search/tab selection on list pages so:
 *   - refreshing the page keeps the user where they were,
 *   - URLs can be copy-pasted / bookmarked with filters applied,
 *   - the back button restores previous filter combinations.
 *
 * The hook is intentionally framework-agnostic (window.location +
 * popstate). It avoids a hard dependency on wouter's `useSearch` so it
 * keeps working if the router is swapped.
 *
 * @param key   query-string parameter name
 * @param defaultValue value used when the key is absent / fails to parse
 * @param parse function that turns the string in the URL into a typed value
 * @param serialize function that turns the typed value back into a string;
 *                  return `null` to remove the key from the URL
 */
export function useUrlState<T>(
  key: string,
  defaultValue: T,
  parse: (raw: string) => T,
  serialize: (value: T) => string | null,
): [T, (value: T) => void] {
  const read = useCallback((): T => {
    if (typeof window === "undefined") return defaultValue;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get(key);
    if (raw === null) return defaultValue;
    try {
      return parse(raw);
    } catch {
      return defaultValue;
    }
  }, [key, defaultValue, parse]);

  const [value, setValue] = useState<T>(read);

  // Keep state in sync if the URL changes from outside (back/forward).
  useEffect(() => {
    const onPop = () => setValue(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [read]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      const serialized = serialize(next);
      if (serialized === null || serialized === "") {
        params.delete(key);
      } else {
        params.set(key, serialized);
      }
      const qs = params.toString();
      const url = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
      // replaceState — filter changes shouldn't pollute browser history.
      window.history.replaceState(window.history.state, "", url);
    },
    [key, serialize],
  );

  return [value, update];
}

// Common parsers/serializers for primitive filter values.

export const urlString = {
  parse: (raw: string) => raw,
  serialize: (v: string) => (v ? v : null),
};

export const urlNumber = {
  parse: (raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error("not a number");
    return n;
  },
  serialize: (v: number | null) => (v == null ? null : String(v)),
};
