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
  email_key: string;
  first_seen: string | null;
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

/* ------------------------------------------------ v6: Phase 1 nomination */

export type Movement = "up" | "down" | "same" | "new";

/** What `board()` returns. No raw counts: `share` is 0–1 of the top company. */
export type Board = {
  total_companies: number;
  recent: { domain: string; display_name: string; first_nominated_at: string }[];
  hot: { domain: string; display_name: string; share: number; movement: Movement }[];
  updated_at: string | null;
  snapshot_at: string | null;
};

export const EMPTY_BOARD: Board = {
  total_companies: 0,
  recent: [],
  hot: [],
  updated_at: null,
  snapshot_at: null,
};

/** A resolver hit or proposal (`resolve_company` / `resolve_domain`). */
export type CompanyMatch = {
  domain: string;
  display_name: string;
  aliases: string[];
  exists?: boolean;
};

export type AdminCompany = {
  domain: string;
  display_name: string;
  aliases: string[];
  status: "active" | "pending" | "hidden";
  is_seed: boolean;
  created_at: string | null;
  merged_into: string | null;
  nominations: number;
  first_nominated_at: string | null;
  last_nominated_at: string | null;
};

// ---------------------------------------------------------------- v7 Phase 2

/** One pick in a `cast_ballot` payload. `reason` is 10–50 characters. */
export type BallotPickInput = { domain: string; reason: string };

/** What `cast_ballot` returns. `ballot_date` is the Asia/Taipei day. */
export type CastBallotResult = {
  ballot_id: number;
  ballot_date: string;
  picks: { pick_id: number; domain: string }[];
};

/** What `react_reason` returns (1 like, -1 dislike, 0 clear). */
export type ReactionCounts = { likes: number; dislikes: number };

/** What `my_vote_state` returns. */
export type MyVoteState = {
  voted_today: boolean;
  today: { domain: string; display_name: string; reason: string }[];
  reactions: { pick_id: number; value: 1 | -1 }[];
};

export const EMPTY_VOTE_STATE: MyVoteState = {
  voted_today: false,
  today: [],
  reactions: [],
};

/** A public reason card (`vote_board` hot/latest reasons). */
export type ReasonCard = {
  pick_id: number;
  domain: string;
  display_name: string;
  reason: string;
  likes: number;
  dislikes: number;
};

export type LeaderboardRow = {
  rank: number;
  domain: string;
  display_name: string;
  votes: number;
  reasons: number;
  movement: Movement;
};

/** What `vote_board` returns. */
export type VoteBoard = {
  total_votes: number;
  total_reasons: number;
  total_voters: number;
  updated_at: string | null;
  leaderboard: LeaderboardRow[];
  hot_reasons: ReasonCard[];
  latest_reasons: ReasonCard[];
  trend: { day: string; ballots: number; reasons: number }[];
};

export const EMPTY_VOTE_BOARD: VoteBoard = {
  total_votes: 0,
  total_reasons: 0,
  total_voters: 0,
  updated_at: null,
  leaderboard: [],
  hot_reasons: [],
  latest_reasons: [],
  trend: [],
};

/** What `company_detail` returns (null when the domain is not a candidate). */
export type CompanyDetail = {
  domain: string;
  display_name: string;
  aliases: string[];
  rank: number;
  votes: number;
  reasons_count: number;
  reasons: {
    pick_id: number;
    reason: string;
    likes: number;
    dislikes: number;
    created_at: string;
  }[];
};

/** What `admin_ballots` returns. */
export type AdminBallots = {
  total: number;
  ballots: {
    id: number;
    email: string;
    email_key: string;
    ballot_date: string;
    session_id: string | null;
    voided: boolean;
    created_at: string;
    picks: {
      pick_id: number;
      domain: string;
      display_name: string;
      reason: string;
      hidden: boolean;
      likes: number;
      dislikes: number;
    }[];
  }[];
};

/** One row of `admin_vote_stats`. votes = picks + bonus + adjust. */
export type AdminVoteStat = {
  domain: string;
  display_name: string;
  status: "active" | "pending" | "hidden";
  is_candidate: boolean;
  rank: number | null;
  picks: number;
  reasons: number;
  reaction_net: number;
  bonus: number;
  adjust: number;
  votes: number;
};
