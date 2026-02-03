"use client";

// Helps surface runtime errors that otherwise look like a blank page.
// Runs only in development.

function ensurePanel() {
  const id = "padix-dev-error-overlay";
  let el = document.getElementById(id);
  if (el) return el;
  el = document.createElement("div");
  el.id = id;
  el.style.position = "fixed";
  el.style.inset = "12px";
  el.style.zIndex = "999999";
  el.style.padding = "12px";
  el.style.borderRadius = "12px";
  el.style.border = "1px solid rgba(255,255,255,0.15)";
  el.style.background = "rgba(0,0,0,0.85)";
  el.style.color = "white";
  el.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
  el.style.fontSize = "12px";
  el.style.overflow = "auto";
  el.style.whiteSpace = "pre-wrap";
  el.style.display = "none";

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.title = "Закрыть и очистить";
  close.style.position = "absolute";
  close.style.top = "10px";
  close.style.right = "14px";
  close.style.width = "32px";
  close.style.height = "32px";
  close.style.borderRadius = "999px";
  close.style.border = "1px solid rgba(255,255,255,0.25)";
  close.style.background = "rgba(255,255,255,0.08)";
  close.style.color = "white";
  close.style.fontSize = "20px";
  close.style.lineHeight = "28px";
  close.style.cursor = "pointer";
  close.onclick = () => {
    try {
      localStorage.removeItem("padix_last_error");
    } catch {
      // ignore
    }
    const existing = document.getElementById(id);
    if (existing) existing.remove();
  };
  el.appendChild(close);

  document.body.appendChild(el);
  return el;
}

function show(title: string, details: unknown) {
  try {
    const payload =
      typeof details === "string"
        ? details
        : details instanceof Error
          ? `${details.name}: ${details.message}\n${details.stack ?? ""}`
          : JSON.stringify(details, null, 2);
    try {
      localStorage.setItem(
        "padix_last_error",
        JSON.stringify({ at: new Date().toISOString(), title, details: payload }),
      );
    } catch {
      // ignore
    }
    const el = ensurePanel();
    el.style.display = "block";
    el.textContent = `[DEV ERROR] ${title}\n\n${payload}`;
    // re-add close button (textContent overwrites)
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.title = "Закрыть и очистить";
    close.style.position = "absolute";
    close.style.top = "10px";
    close.style.right = "14px";
    close.style.width = "32px";
    close.style.height = "32px";
    close.style.borderRadius = "999px";
    close.style.border = "1px solid rgba(255,255,255,0.25)";
    close.style.background = "rgba(255,255,255,0.08)";
    close.style.color = "white";
    close.style.fontSize = "20px";
    close.style.lineHeight = "28px";
    close.style.cursor = "pointer";
    close.onclick = () => {
      try {
        localStorage.removeItem("padix_last_error");
      } catch {
        // ignore
      }
      const existing = document.getElementById("padix-dev-error-overlay");
      if (existing) existing.remove();
    };
    el.appendChild(close);
  } catch {
    // ignore
  }
}

export function installDevErrorOverlay() {
  if (!import.meta.env.DEV) return;
  // Do NOT auto-restore last error on every reload.
  // It creates a "sticky" error panel even when the underlying issue is already fixed.
  window.addEventListener("error", (ev) => {
    show("window.error", (ev as ErrorEvent).error ?? (ev as ErrorEvent).message);
  });
  window.addEventListener("unhandledrejection", (ev) => {
    show("unhandledrejection", (ev as PromiseRejectionEvent).reason);
  });
}

