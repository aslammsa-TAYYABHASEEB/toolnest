"use client";

import { useEffect, useState } from "react";
import { IconButton } from "@/components/ui/icon-button";

type ThemePreference = "system" | "light" | "dark";
const preferences: ThemePreference[] = ["system", "light", "dark"];

function applyTheme(preference: ThemePreference) {
  const dark = preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    const saved = window.localStorage.getItem("toolnest-theme") as ThemePreference | null;
    const initial = saved && preferences.includes(saved) ? saved : "system";
    setPreference(initial);
    applyTheme(initial);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => { if ((window.localStorage.getItem("toolnest-theme") ?? "system") === "system") applyTheme("system"); };
    media.addEventListener("change", onSystemChange);
    return () => media.removeEventListener("change", onSystemChange);
  }, []);

  function cycleTheme() {
    const next = preferences[(preferences.indexOf(preference) + 1) % preferences.length];
    setPreference(next);
    window.localStorage.setItem("toolnest-theme", next);
    applyTheme(next);
  }

  const next = preferences[(preferences.indexOf(preference) + 1) % preferences.length];
  return (
    <IconButton className="theme-toggle" label={`Theme: ${preference}. Switch to ${next}.`} onClick={cycleTheme}>
      <span className={`theme-icon theme-icon-${preference}`} aria-hidden="true" />
    </IconButton>
  );
}
