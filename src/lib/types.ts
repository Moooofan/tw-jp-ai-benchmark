export type Phase = "pre" | "nominate" | "vote" | "closed" | "results";
export type PhaseMode = "auto" | "manual";

/** Everything `stats()` returns. No scores, no rankings — Phase 1 hides both. */
export type Stats = {
  people: number;
  companies: number;
  /** effective_phase(): what the site should show right now. */
  phase: Phase;
  phase_mode: PhaseMode;
  /** The raw settings.phase radio value; only binding when phase_mode is 'manual'. */
  manual_phase: Phase;
  nominate_open: string | null;
  nominate_close: string | null;
  vote_open: string | null;
  vote_close: string | null;
  results_label: string;
  iqlite_url: string;
  ximu_url: string;
  partners_text: string;
  contact_email: string;
};

export type PublicPost = {
  id: string;
  company: string;
  company_en: string;
  url: string;
  reason: string;
  masked_email: string;
  created_at: string;
};

export type PublicFinalist = {
  id: string;
  company: string;
  name_en: string;
  one_liner: string;
  industry: string;
  jp_info: string;
  url: string;
  report_url: string;
  blurb: string;
  top_reason: string;
  sort: number;
  votes?: number;
};

export type AdminPost = {
  id: string;
  company: string;
  company_en: string;
  url: string;
  company_key: string;
  reason: string;
  email: string;
  up: number;
  down: number;
  adjust: number;
  hidden: boolean;
  flagged: number;
  created_at: string;
};

export type AdminFinalist = {
  id: string;
  company: string;
  name_en: string;
  one_liner: string;
  industry: string;
  jp_info: string;
  url: string;
  report_url: string;
  blurb: string;
  top_reason: string;
  sort: number;
  adjust: number;
  votes: number;
};

export type AdminPerson = {
  email: string;
  user_id: string;
  created_at: string;
  last_sign_in_at: string | null;
  n_posts: number;
  n_votes: number;
  n_final_votes: number;
  companies: string[];
};

export type Settings = {
  id: number;
  phase: Phase;
  phase_mode: PhaseMode;
  nominate_open: string | null;
  nominate_close: string | null;
  vote_open: string | null;
  vote_close: string | null;
  results_label: string;
  iqlite_url: string;
  ximu_url: string;
  partners_text: string;
  contact_email: string;
  people_offset: number;
  companies_offset: number;
};

export type MyState = {
  votes: Record<string, number>;
  picks: string[];
  reports: string[];
};

export const EMPTY_STATE: MyState = { votes: {}, picks: [], reports: [] };
