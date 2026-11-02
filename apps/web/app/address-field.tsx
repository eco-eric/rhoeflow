"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

interface Suggestion {
  label: string;
  line1: string;
  city: string | null;
  state: string | null;
  postal_code: string | null;
}

export interface AddressValue {
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
}

/**
 * Street, city, state and ZIP for a new customer (ADR-041). Typing the street looks it up through
 * OpenRouteService; picking a suggestion fills all four fields. Typing by hand always works, and
 * the lookup stays out of the way when it isn't set up or can't find a street.
 */
export function AddressField({ value, onChange }: { value: AddressValue; onChange: (v: AddressValue) => void }) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [note, setNote] = useState<string | null>(null);
  const enabled = useRef(true);
  const picked = useRef<string | null>(null);
  const listId = useId();

  useEffect(() => {
    const q = value.address_line1.trim();
    if (!enabled.current || q.length < 4 || q === picked.current) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/address?q=${encodeURIComponent([q, value.city, value.state].filter(Boolean).join(", "))}`, { signal: controller.signal, cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { enabled: boolean; items?: Suggestion[]; error?: string };
        if (!body.enabled) {
          enabled.current = false;
          return;
        }
        setItems(body.items ?? []);
        setActive(-1);
        setOpen(true);
        setNote(body.error ?? null);
      } catch {
        // Offline or aborted: typing by hand still works.
      }
    }, 350);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
    // Only the street drives the lookup; city and state narrow it when already typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.address_line1]);

  function pick(s: Suggestion) {
    picked.current = s.line1;
    onChange({ address_line1: s.line1, city: s.city ?? value.city, state: s.state ?? value.state, postal_code: s.postal_code ?? value.postal_code });
    setOpen(false);
    setItems([]);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(items[active]!);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const set = (k: keyof AddressValue) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  const showList = open && (items.length > 0 || note);

  return (
    <>
      <div className="suggest">
        <label className="field">
          Street address
          <input
            name="address_line1"
            required
            maxLength={200}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="next"
            value={value.address_line1}
            onChange={(e) => {
              picked.current = null;
              set("address_line1")(e);
            }}
            onKeyDown={onKey}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onFocus={() => items.length > 0 && setOpen(true)}
            role="combobox"
            aria-expanded={showList ? true : false}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            placeholder="Start typing; pick from the list or keep typing"
          />
        </label>
        {showList ? (
          <ul id={listId} role="listbox" aria-label="Matching addresses">
            {items.map((s, i) => (
              <li
                key={s.label}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
              >
                {s.line1}
                <small>{[s.city, [s.state, s.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</small>
              </li>
            ))}
            {note ? <li className="credit" role="presentation">{note}</li> : null}
            {items.length > 0 ? (
              <li className="credit" role="presentation">
                Addresses: openrouteservice.org by HeiGIT, map data © OpenStreetMap contributors
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
      <div className="addr-row">
        <label className="field">
          City
          <input name="city" maxLength={100} autoComplete="off" autoCapitalize="words" enterKeyHint="next" value={value.city} onChange={set("city")} />
        </label>
        <label className="field">
          State
          <input name="state" maxLength={50} autoComplete="off" autoCapitalize="characters" enterKeyHint="next" placeholder="TX" value={value.state} onChange={set("state")} />
        </label>
        <label className="field">
          ZIP
          <input name="postal_code" maxLength={20} inputMode="numeric" autoComplete="off" enterKeyHint="next" value={value.postal_code} onChange={set("postal_code")} />
        </label>
      </div>
    </>
  );
}
