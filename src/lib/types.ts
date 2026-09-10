export type Phase = "nominate" | "vote" | "results";

export type Stats = {
  people: number;
  companies: number;
  phase: Phase;
  nominate_close: string | null;
  vote_close: string | null;
};

export type PublicPost = {
  id: string;
  company: string;
  reason: string;
  masked_email: string;
  score: number;
  created_at: string;
};

export type PublicFinalist = {
  id: string;
  company: string;
  blurb: string;
  top_reason: string;
  sort: number;
  votes?: number;
};

export type AdminPost = {
  id: string;
  company: string;
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
  nominate_close: string | null;
  vote_close: string | null;
  people_offset: number;
  companies_offset: number;
};

export type MyState = {
  votes: Record<string, number>;
  picks: string[];
  reports: string[];
};

export const EMPTY_STATE: MyState = { votes: {}, picks: [], reports: [] };
