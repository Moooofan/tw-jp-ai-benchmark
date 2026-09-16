"use client";

import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Globe,
  Plus,
  RotateCcw,
  Search,
  SquareCheckBig,
} from "lucide-react";
import { isNameKey, nameKey } from "@/lib/format";
import { getBrowserClient } from "@/lib/supabase-browser";
import type { CompanyMatch, ExternalCompany } from "@/lib/types";
import Favicon from "./Favicon";
import Icon from "./Icon";

/**
 * Same debounce as NominateClient's search box (see the note there): 400ms
 * roughly halves the /api/company-lookup per-IP request budget a company
 * name would otherwise spend without the box feeling slow.
 */
const SEARCH_MS = 400;

/** Same normalisation as the name key: collapse whitespace, trim. */
const cleanName = (s: string) => s.replace(/\s+/g, " ").trim();
const NAME_MIN = 2;
/** Wikidata descriptions are one-liners; anything longer is noise in a row. */
const DESC_MAX = 30;
const clip = (s: string) =>
  s.length > DESC_MAX ? `${s.slice(0, DESC_MAX)}…` : s;

/**
 * `typed`: campaign memo v4.0 defines no Phase-2 shortlist, so a voter must
 * be able to pick a company nobody nominated — picking it creates the
 * company and a nomination row (mirrors NominateClient's typed path).
 * `external`: picked from the public-data suggestions — it already has a
 * real domain, shown in an editable website field.
 */
type Step =
  | { kind: "search" }
  | { kind: "confirm"; company: CompanyMatch; typed: boolean; external?: boolean };

export type Picked = {
  domain: string;
  display_name: string;
  aliases?: string[];
  site: string | null;
  isNew: boolean;
};

type Props = {
  onPick: (c: Picked) => void;
  disabled?: boolean;
  pickedDomains: string[];
  autoFocus?: boolean;
};

/** Copy of NominateClient's CompanyCard, reused for the confirm sub-step. */
function CompanyPreview({ c }: { c: CompanyMatch }) {
  const pending = isNameKey(c.domain);
  return (
    <div className="cocard">
      <Favicon domain={c.domain} name={c.display_name} size={44} />
      <div>
        <b>{c.display_name}</b>
        {c.aliases.length > 0 ? <small>{c.aliases.join(" · ")}</small> : null}
        {pending ? (
          <small>官網待確認</small>
        ) : (
          <a
            href={`https://${c.domain}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {c.domain}
            <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * The Phase-1 nomination search experience, reused for the Phase-2 ballot's
 * company picker (campaign memo v4.0: Phase 2 has no defined shortlist, so a
 * voter must be able to vote for a company nobody nominated — picking it
 * creates the company and a nomination row). Deliberately a standalone copy
 * of NominateClient's search step rather than a shared import —
 * NominateClient must stay byte-identical, duplication is the accepted
 * trade-off.
 */
export default function CompanyPicker({
  onPick,
  disabled = false,
  pickedDomains,
  autoFocus = false,
}: Props) {
  const supabase = getBrowserClient();
  const [step, setStep] = useState<Step>({ kind: "search" });
  const [name, setName] = useState("");
  const [site, setSite] = useState("");
  const [matches, setMatches] = useState<CompanyMatch[]>([]);
  const [externals, setExternals] = useState<ExternalCompany[]>([]);
  const [searched, setSearched] = useState("");
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = name.trim();
    let live = true;
    const abort = new AbortController();
    const t = setTimeout(
      () => {
        // The vote-appropriate ranked search decides the list (instant,
        // authoritative; an empty query is the top-12 initial affordance);
        // the public lookup only appends extra candidates and must never
        // hold it up.
        void (async () => {
          const { data } = await supabase.rpc("vote_candidates", { q });
          if (!live) return;
          setMatches((data as CompanyMatch[] | null) ?? []);
          setSearched(name.trim());
        })();
        if (q.length >= NAME_MIN) {
          void (async () => {
            try {
              const res = await fetch(
                `/api/company-lookup?q=${encodeURIComponent(q)}`,
                { signal: abort.signal },
              );
              const json = (await res.json()) as {
                suggestions?: ExternalCompany[];
              };
              if (!live) return;
              setExternals(json.suggestions ?? []);
            } catch {
              if (live) setExternals([]); // suggestions are a bonus, never an error
            }
          })();
        } else {
          setExternals([]);
        }
      },
      q ? SEARCH_MS : 0,
    );
    return () => {
      live = false;
      abort.abort();
      clearTimeout(t);
    };
  }, [name, supabase]);

  // Offer "nominate the typed name" once results for exactly this text are
  // back and none of them is an exact display name / alias match.
  const typed = cleanName(name);
  const typedLower = typed.toLowerCase();
  const offerTyped =
    typed.length >= NAME_MIN &&
    searched === name.trim() &&
    !matches.some(
      (m) =>
        cleanName(m.display_name).toLowerCase() === typedLower ||
        m.aliases.some((a) => cleanName(a).toLowerCase() === typedLower),
    );

  // Public-data suggestions we do not already list ourselves, and not one
  // already sitting in the voter's picks.
  const extras = externals.filter(
    (e) =>
      !pickedDomains.includes(e.domain) &&
      !matches.some(
        (m) =>
          m.domain === e.domain ||
          cleanName(m.display_name).toLowerCase() ===
            cleanName(e.display_name).toLowerCase(),
      ),
  );

  function resetToSearch() {
    setStep({ kind: "search" });
    setName("");
    setSite("");
    setMatches([]);
    setExternals([]);
    setSearched("");
    if (!disabled) setTimeout(() => nameInput.current?.focus(), 0);
  }

  function pickMatch(c: CompanyMatch) {
    onPick({
      domain: c.domain,
      display_name: c.display_name,
      aliases: c.aliases,
      site: null,
      isNew: false,
    });
    resetToSearch();
  }

  function pickExternal(e: ExternalCompany) {
    setSite(e.domain);
    setStep({
      kind: "confirm",
      company: { domain: e.domain, display_name: e.display_name, aliases: [] },
      typed: false,
      external: true,
    });
  }

  function openTyped() {
    setSite("");
    setStep({
      kind: "confirm",
      company: {
        domain: nameKey(typed) ?? "name:",
        display_name: typed,
        aliases: [],
      },
      typed: true,
    });
  }

  function confirmPick() {
    if (step.kind !== "confirm") return;
    const c = step.company;
    if (step.external) {
      onPick({
        domain: c.domain,
        display_name: c.display_name,
        aliases: c.aliases,
        site: site.trim() || null,
        isNew: true,
      });
    } else {
      // Typed path: no confirmed domain yet — campaign memo v4.0 lets a
      // voter nominate on the spot; the (optional) website goes along
      // separately and the backend resolves/creates the company by name.
      onPick({
        domain: "",
        display_name: c.display_name,
        aliases: c.aliases,
        site: site.trim() || null,
        isNew: true,
      });
    }
    resetToSearch();
  }

  if (step.kind === "confirm") {
    const c = step.company;
    return (
      <div className="flow">
        <CompanyPreview c={c} />
        <p className="fine">
          {step.external
            ? "網址來自公開資料，可以修改。"
            : "這家公司還沒被提名過，選了就會一併提名。"}
        </p>
        <div className="f">
          <label htmlFor="picker-site">
            <Icon icon={Globe} />
            {step.external ? "官方網站" : "官方網站（選填）"}
          </label>
          <input
            id="picker-site"
            value={site}
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://"
            disabled={disabled}
            onChange={(e) => setSite(e.target.value)}
          />
        </div>
        <div className="after">
          <button
            type="button"
            className="btn btn--red"
            disabled={disabled}
            onClick={confirmPick}
          >
            選這家：{c.display_name}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={disabled}
            onClick={() => setStep({ kind: "search" })}
          >
            <RotateCcw size={16} strokeWidth={1.75} aria-hidden="true" />
            不是，重新搜尋
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="picker">
      <div className="f">
        <label htmlFor="ballot-search">
          <Icon icon={Search} />
          選擇公司（最多三家）
        </label>
        <input
          id="ballot-search"
          ref={nameInput}
          value={name}
          autoComplete="off"
          maxLength={60}
          placeholder="搜尋公司名稱或網域"
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {matches.length > 0 ? (
        <ul className="cands" aria-label={name.trim() ? "搜尋結果" : "熱門候選"}>
          {matches.map((c) => {
            const on = pickedDomains.includes(c.domain);
            return (
              <li key={c.domain}>
                <button
                  type="button"
                  disabled={disabled || on}
                  onClick={() => pickMatch(c)}
                  className={on ? "on" : undefined}
                >
                  <Favicon domain={c.domain} name={c.display_name} size={24} />
                  <span className="cands__n">{c.display_name}</span>
                  {on ? (
                    <SquareCheckBig size={16} strokeWidth={1.75} aria-hidden="true" />
                  ) : (
                    <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {extras.length > 0 || offerTyped ? (
        <ul className="matches" aria-label="其他搜尋結果">
          {extras.length > 0 ? (
            <li className="sep" aria-hidden="true">
              其他可能的公司
            </li>
          ) : null}
          {extras.map((e) => (
            <li key={`x:${e.domain}`}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => pickExternal(e)}
              >
                <span
                  className="fav fav--none"
                  style={{ width: 28, height: 28 }}
                  aria-hidden="true"
                >
                  {(e.display_name.trim()[0] ?? "?").toUpperCase()}
                </span>
                <span className="co">
                  <b>{e.display_name}</b>
                  {e.description ? <small>{clip(e.description)}</small> : null}
                </span>
                <span className="dom">
                  <span className="srcchip">
                    {e.source === "web" ? "網站驗證" : "公開資料"}
                  </span>
                  {e.domain}
                </span>
              </button>
            </li>
          ))}
          {offerTyped ? (
            <li>
              <button type="button" disabled={disabled} onClick={openTyped}>
                <span
                  className="fav fav--none"
                  style={{ width: 28, height: 28 }}
                  aria-hidden="true"
                >
                  <Plus size={16} strokeWidth={2} />
                </span>
                <span className="co">
                  <b>找不到？直接提名「{typed}」</b>
                </span>
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
