"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  actorLabel,
  filterCommands,
  filterNavShortcuts,
  type CommandEntry,
} from "@/lib/admin/command-catalog";

type PaletteItem =
  | { kind: "nav"; id: string; label: string; href: string }
  | { kind: "command"; entry: CommandEntry };

function commandHref(entry: CommandEntry): string {
  return `/admin/commands?q=${encodeURIComponent(entry.id)}`;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items: PaletteItem[] = useMemo(() => {
    const nav = filterNavShortcuts(query).map((n) => ({
      kind: "nav" as const,
      id: n.id,
      label: n.label,
      href: n.href,
    }));
    const cmds = filterCommands(query).map((entry) => ({
      kind: "command" as const,
      entry,
    }));
    return [...nav, ...cmds].slice(0, 24);
  }, [query]);

  useEffect(() => {
    setActive(0);
  }, [query, open]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const run = useCallback(
    (item: PaletteItem) => {
      if (item.kind === "nav") {
        router.push(item.href);
      } else {
        router.push(commandHref(item.entry));
      }
      close();
    },
    [close, router]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (!open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && items[active]) {
        e.preventDefault();
        run(items[active]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items, active, close, run]);

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Command palette (⌘K)"
        style={{
          marginLeft: "auto",
          padding: "0.35rem 0.65rem",
          border: open ? "1px solid #111" : "1px solid #ccc",
          borderRadius: 6,
          background: open ? "#111" : "#fff",
          color: open ? "#fff" : "#555",
          fontSize: "0.8rem",
          cursor: "pointer",
          fontFamily: "ui-monospace, monospace",
        }}
      >
        ⌘K
      </button>
      {open ? (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          background: "rgba(0,0,0,0.35)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          paddingTop: "12vh",
        }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div
          style={{
            width: "min(560px, 92vw)",
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #ddd",
            boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
            overflow: "hidden",
          }}
        >
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a page or find a command…"
            style={{
              width: "100%",
              padding: "0.9rem 1rem",
              border: "none",
              borderBottom: "1px solid #eee",
              fontSize: "1rem",
              outline: "none",
            }}
          />
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: "0.35rem 0",
              maxHeight: 360,
              overflow: "auto",
            }}
          >
            {items.length === 0 ? (
              <li style={{ padding: "0.75rem 1rem", color: "#666" }}>
                No matches
              </li>
            ) : (
              items.map((item, i) => {
                const selected = i === active;
                if (item.kind === "nav") {
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onMouseEnter={() => setActive(i)}
                        onClick={() => run(item)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "0.55rem 1rem",
                          border: "none",
                          background: selected ? "#f0f0f0" : "transparent",
                          cursor: "pointer",
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{item.label}</span>
                        <span style={{ color: "#888", marginLeft: 8 }}>
                          Go to page
                        </span>
                      </button>
                    </li>
                  );
                }
                const c = item.entry;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => run(item)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "0.55rem 1rem",
                        border: "none",
                        background: selected ? "#f0f0f0" : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <div
                        style={{
                          fontFamily: "ui-monospace, monospace",
                          fontSize: "0.85rem",
                        }}
                      >
                        {c.id}
                        {c.mutating ? (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: "0.7rem",
                              color: "#a40",
                              fontFamily: "system-ui, sans-serif",
                            }}
                          >
                            mutates
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "#555" }}>
                        {actorLabel(c.actor)} · {c.summary}
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <div
            style={{
              padding: "0.45rem 1rem",
              borderTop: "1px solid #eee",
              fontSize: "0.75rem",
              color: "#888",
              display: "flex",
              gap: "0.75rem",
            }}
          >
            <span>↑↓ move</span>
            <span>↵ open</span>
            <span>esc close</span>
          </div>
        </div>
      </div>
      ) : null}
    </>
  );
}
