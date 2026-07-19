import { useCallback, useState } from "react";

/** Reads and writes a JSON value in localStorage. Used for the calendar's view
 * preferences so a shop owner's chosen view survives a restart. */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      // A corrupt or unreadable entry must never break the page.
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const next = value instanceof Function ? value(prev) : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Storage full or blocked — keep the in-memory value anyway.
        }
        return next;
      });
    },
    [key],
  );

  return [storedValue, setValue];
}

