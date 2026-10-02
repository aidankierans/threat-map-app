import profile from "@threat-map/data/profile.json";
export const REPO_SOURCE_BASE = import.meta.env?.VITE_REPO_SOURCE_BASE ??
    profile.sourceBase;
export const THEME_KEY = "threatmap-theme";
export const VIEW_KEY = "threatmap-view";
export const SAVED_KEY = "threatmap-saved-filters";
export const CASE_KEY = "threatmap-case-studies-v1";
export const CASE_DRAFT_KEY = "threatmap-case-draft-v1";
export const SEEDED_KEY = "threatmap-seeded-presets";
export const FEEDBACK_LIMITS = { message: 5000, name: 120, contact: 200 } as const;
