-- Brain v3 · F1 — one merchant, one identity.
-- Applied as migration `brain_f1_merchant_identity`. Kept here as the
-- reference copy. Design: docs/brain-v3.md §3.A. No AI, no trained model.
--
-- Before: lp_private.merchant_key took the first two words left after
-- dropping digits and a few noise words. The same merchant got many keys and
-- learned each one separately:
--   "AMZN Mktp US*2K3"  -> "amzn mktp"      "AMAZON.COM*AB12" -> "amazon ab"
--   "SQ *BLUE BOTTLE"   -> "sq blue"        "VERIZON WIRELESS" -> "verizon wireless"
--
-- Now:
--   · lp_private.merchant_clean(text): strips card-processor prefixes
--     (SQ *, TST*, PAYPAL *, DD *…), bank wording (POS, CHECKCARD, "purchase
--     authorized on 09/12"…), everything after a '*', web suffixes and
--     digits.
--   · lp_private.merchant_aliases: planted aliases (kind 'seed', global) map
--     a cleaned text to one canonical merchant; kind 'merge' (per workspace,
--     written when a person merges two merchants -- F2) maps one key to
--     another. Money processors whose lines go both ways (Stripe, PayPal,
--     Shopify) only have aliases for their payouts, so a fee never learns
--     from a payout.
--   · lp_private.merchant_key(text) = clean + planted aliases, else the first
--     two meaningful words as before. Same signature: the risk rules,
--     receipt matching, For review and learning all get it at once.
--   · lp_private.merchant_identity(org, client, text) = merchant_key, then
--     the workspace's own merges, then -- only for a merchant this workspace
--     has never confirmed -- the single clearly closest merchant it HAS
--     confirmed (pg_trgm similarity >= 0.6 and at least 0.15 ahead of the
--     next). Two close candidates: no guess. Learning, suggestions, the
--     correction and For review use it.
--   · user_patterns learned under old keys are re-keyed (and merged when two
--     old keys are now one merchant).
--   · transactions.merchant_key (indexed) is stamped on insert by the risk
--     Brain's trigger, so the risk rules compare an indexed column instead of
--     re-cleaning every past line on every insert. Locked lines can't be
--     updated: they keep NULL and the rules compute theirs on the fly.
--     lp_private.refresh_merchant_keys(org) re-stamps after the aliases change.

create extension if not exists pg_trgm with schema extensions;

-- ── Cleaning ────────────────────────────────────────────────────────────────

create or replace function lp_private.merchant_clean(p text)
returns text
language plpgsql
immutable
as $$
declare
  s    text := lower(coalesce(p, ''));
  prev text;
begin
  -- Prefixes can stack ("POS DEBIT SQ *COFFEE"): strip until nothing changes.
  loop
    prev := s;
    s := regexp_replace(s, '^\s*(sq|tst|sp|dd|py|ppl|paypal|pp|ic|bt|sqc)\s*\*\s*', '');
    s := regexp_replace(s, '^\s*(pos|ach|chk|checkcard|check card|debit card purchase|debit purchase|card purchase|'
                        || 'purchase authorized on [0-9/]+|purchase [0-9/]+|recurring payment|recurring|pmt|web|ext|'
                        || 'bill pay|online payment|debit|dbt|visa)\M\s*[-:#]?\s*', '');
    exit when s = prev;
  end loop;
  s := regexp_replace(s, '\*.*$', '');                      -- "amazon.com*ab12cd" -> "amazon.com"
  s := regexp_replace(s, 'www\.', '', 'g');
  s := regexp_replace(s, '\.(com|net|org|io|co|us)\M', ' ', 'g');
  s := regexp_replace(s, '[^a-z& ]+', ' ', 'g');             -- digits, store numbers, punctuation
  s := btrim(regexp_replace(s, '\s+', ' ', 'g'));
  return s;
end;
$$;

-- ── Aliases ─────────────────────────────────────────────────────────────────

create table if not exists lp_private.merchant_aliases (
  id         bigserial primary key,
  kind       text    not null check (kind in ('seed', 'merge')),
  org_id     uuid    references public.organizations(id) on delete cascade,
  client_id  uuid    references public.clients(id) on delete cascade,
  pattern    text    not null,   -- seed: regex on the cleaned text; merge: the exact key being merged
  canonical  text    not null,   -- the merchant it is
  priority   integer not null default 50,
  created_by uuid,
  created_at timestamptz not null default now(),
  check ((kind = 'seed') = (org_id is null))
);
create unique index if not exists merchant_aliases_seed_uq
  on lp_private.merchant_aliases (pattern) where kind = 'seed';
create unique index if not exists merchant_aliases_merge_uq
  on lp_private.merchant_aliases (org_id, coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid), pattern)
  where kind = 'merge';
comment on table lp_private.merchant_aliases is
  'Merchant identity: planted aliases (seed, global regex -> canonical) and a workspace''s own merges (merge, key -> key). No model.';

delete from lp_private.merchant_aliases where kind = 'seed';
insert into lp_private.merchant_aliases (kind, pattern, canonical, priority) values
  -- Payouts first: money processors go both ways; only the payout is one merchant.
  ('seed', '\mstripe\M.*\m(payout|transfer|deposit)\M',           'stripe payout',     10),
  ('seed', '\mpaypal\M.*\m(transfer|payout|deposit)\M',           'paypal transfer',   10),
  ('seed', '\mshopify\M.*\m(payout|payments|transfer|deposit)\M', 'shopify payout',    10),
  -- Specific before generic.
  ('seed', '\m(amazon web services|aws)\M',          'aws',               10),
  ('seed', '\mgoogle\s*(ads|adwords)\M',             'google ads',        10),
  ('seed', '\m(google\s*(workspace|gsuite|g suite)|gsuite)\M', 'google workspace', 10),
  ('seed', '\mgoogle\s*(cloud|gcp)\M',               'google cloud',      10),
  ('seed', '\mgoogle\s*(storage|one)\M',             'google one',        10),
  ('seed', '\muber\s*eats\M',                        'uber eats',         10),
  ('seed', '\m(amzn|amazon)\M',                      'amazon',            20),
  ('seed', '\m(apple|itunes)\M',                     'apple',             20),
  ('seed', '\muber\M',                               'uber',              20),
  ('seed', '\mlyft\M',                               'lyft',              20),
  ('seed', '\mdoordash\M',                           'doordash',          20),
  ('seed', '\mgrubhub\M',                            'grubhub',           20),
  ('seed', '\mstarbucks\M',                          'starbucks',         20),
  ('seed', '\mmcdonald',                             'mcdonalds',         20),
  ('seed', '\mchipotle\M',                           'chipotle',          20),
  ('seed', '\mdunkin\M',                             'dunkin',            20),
  ('seed', '\mpanera\M',                             'panera',            20),
  ('seed', '\m(wal mart|walmart|wm supercenter)\M',  'walmart',           20),
  ('seed', '\mcostco\M',                             'costco',            20),
  ('seed', '\mhome depot\M',                         'home depot',        20),
  ('seed', '\m(lowe s|lowes)\M',                     'lowes',             20),
  ('seed', '\mbest buy\M',                           'best buy',          20),
  ('seed', '\mstaples\M',                            'staples',           20),
  ('seed', '\m(office depot|officemax)\M',           'office depot',      20),
  ('seed', '\mchevron\M',                            'chevron',           20),
  ('seed', '\mexxon',                                'exxon',             20),
  ('seed', '\mverizon\M',                            'verizon',           20),
  ('seed', '\m(at&t|at t|att)\M',                    'at&t',              20),
  ('seed', '\mt\s*mobile\M',                         't-mobile',          20),
  ('seed', '\m(comcast|xfinity)\M',                  'comcast',           20),
  ('seed', '\m(microsoft|msft)\M',                   'microsoft',         20),
  ('seed', '\madobe\M',                              'adobe',             20),
  ('seed', '\mzoom\M',                               'zoom',              20),
  ('seed', '\mslack\M',                              'slack',             20),
  ('seed', '\mdropbox\M',                            'dropbox',           20),
  ('seed', '\mgithub\M',                             'github',            20),
  ('seed', '\matlassian\M',                          'atlassian',         20),
  ('seed', '\mnotion\M',                             'notion',            20),
  ('seed', '\mcanva\M',                              'canva',             20),
  ('seed', '\mfigma\M',                              'figma',             20),
  ('seed', '\m(openai|chatgpt)\M',                   'openai',            20),
  ('seed', '\manthropic\M',                          'anthropic',         20),
  ('seed', '\m(intuit|quickbooks)\M',                'intuit',            20),
  ('seed', '\mhubspot\M',                            'hubspot',           20),
  ('seed', '\mmailchimp\M',                          'mailchimp',         20),
  ('seed', '\mgusto\M',                              'gusto',             20),
  ('seed', '\mpaychex\M',                            'paychex',           20),
  ('seed', '\mfedex\M',                              'fedex',             20),
  ('seed', '\m(usps|postal service)\M',              'usps',              20),
  ('seed', '\mdhl\M',                                'dhl',               20),
  ('seed', '\mmarriott\M',                           'marriott',          20),
  ('seed', '\mhilton\M',                             'hilton',            20),
  ('seed', '\mhyatt\M',                              'hyatt',             20),
  ('seed', '\mairbnb\M',                             'airbnb',            20),
  ('seed', '\mdelta\s*(air|airlines)\M',             'delta airlines',    20),
  ('seed', '\munited\s*(air|airlines)\M',            'united airlines',   20),
  ('seed', '\mamerican\s*(air|airlines)\M',          'american airlines', 20),
  ('seed', '\msouthwest\s*(air|airlines)?\M',        'southwest airlines',20),
  ('seed', '\mjetblue\M',                            'jetblue',           20),
  ('seed', '\mexpedia\M',                            'expedia',           20),
  ('seed', '\mnetflix\M',                            'netflix',           20),
  ('seed', '\mspotify\M',                            'spotify',           20),
  ('seed', '\mlinkedin\M',                           'linkedin',          20),
  ('seed', '\m(facebook|facebk|fb ads|meta ads|meta platforms)\M', 'meta', 20),
  ('seed', '\msquarespace\M',                        'squarespace',       20),
  ('seed', '\mgodaddy\M',                            'godaddy',           20),
  ('seed', '\mgeico\M',                              'geico',             20),
  ('seed', '\mstate farm\M',                         'state farm',        20),
  ('seed', '\mallstate\M',                           'allstate',          20),
  ('seed', '\mshell\s*(oil|service|station)?\M',     'shell',             30),
  ('seed', '\mtarget\M',                             'target',            30),
  ('seed', '\mups\M',                                'ups',               30),
  ('seed', '\madp\M',                                'adp',               30);

-- ── The key (global) and the identity (per workspace) ──────────────────────

create or replace function lp_private.merchant_key(p text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  c text := lp_private.merchant_clean(p);
  v text;
begin
  if c = '' then
    return '';
  end if;
  select a.canonical into v
    from lp_private.merchant_aliases a
   where a.kind = 'seed' and c ~ a.pattern
   order by a.priority, a.id
   limit 1;
  if v is not null then
    return v;
  end if;
  return coalesce(array_to_string(array(
    select w
      from unnest(regexp_split_to_array(c, '\s+')) with ordinality as u(w, i)
     where length(w) > 1
       and w not in ('pos','debit','dbt','card','purchase','checkcard','visa','mc','ach','web',
                     'ppd','ccd','recurring','pmt','payment','online','www','com','inc','llc',
                     'co','the','sq','tst','pp','id','ref','xx','xxxx','des','indn','orig','corp','ltd')
     order by i
     limit 2
  ), ' '), '');
end;
$$;

create or replace function lp_private.merchant_identity(p_org_id uuid, p_client_id uuid, p_text text)
returns text
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_key   text := lp_private.merchant_key(p_text);
  v_cat   text := case when p_client_id is null then 'learned' else 'learned:' || p_client_id end;
  v_to    text;
  v_best  text;
  v_s1    real;
  v_s2    real;
begin
  if v_key = '' then
    return '';
  end if;

  -- The workspace said "these are the same merchant".
  select a.canonical into v_to
    from lp_private.merchant_aliases a
   where a.kind = 'merge' and a.org_id = p_org_id
     and a.client_id is not distinct from p_client_id
     and a.pattern = v_key
   limit 1;
  if v_to is not null then
    return v_to;
  end if;

  -- Already known here: it is itself.
  if exists (select 1 from public.user_patterns up
              where up.org_id = p_org_id and up.category = v_cat and up.keyword = v_key) then
    return v_key;
  end if;

  -- Never confirmed here: the ONE clearly closest merchant that was, or none.
  select up.keyword, similarity(up.keyword, v_key)
    into v_best, v_s1
    from public.user_patterns up
   where up.org_id = p_org_id and up.category = v_cat and up.is_active
     and similarity(up.keyword, v_key) >= 0.6
   order by similarity(up.keyword, v_key) desc, up.keyword
   limit 1;
  if v_best is null then
    return v_key;
  end if;
  select max(similarity(up.keyword, v_key)) into v_s2
    from public.user_patterns up
   where up.org_id = p_org_id and up.category = v_cat and up.is_active
     and up.keyword <> v_best;
  if coalesce(v_s2, 0) <= v_s1 - 0.15 then
    return v_best;
  end if;
  return v_key;
end;
$$;

revoke all on function lp_private.merchant_clean(text)                  from public, anon, authenticated;
revoke all on function lp_private.merchant_key(text)                    from public, anon, authenticated;
revoke all on function lp_private.merchant_identity(uuid, uuid, text)   from public, anon, authenticated;
revoke all on lp_private.merchant_aliases                               from public, anon, authenticated;

-- ── Learning, suggestions, the correction and For review use the identity ─

create or replace function pg_temp.patch_function(p_fn regprocedure, p_from text[], p_to text[])
returns void
language plpgsql
as $$
declare
  v_def text := pg_get_functiondef(p_fn);
  i     int;
begin
  for i in 1 .. array_length(p_from, 1) loop
    if position(p_from[i] in v_def) = 0 then
      raise exception '%: text to replace not found: %', p_fn, p_from[i];
    end if;
    v_def := replace(v_def, p_from[i], p_to[i]);
  end loop;
  execute v_def;
end;
$$;

select pg_temp.patch_function(
  (select p.oid::regprocedure from pg_proc p where p.proname = 'learn_merchant' and p.pronamespace = 'lp_private'::regnamespace),
  array['lp_private.merchant_key(coalesce(p_tx.merchant_name, p_tx.description))'],
  array['lp_private.merchant_identity(p_org_id, p_tx.client_id, coalesce(p_tx.merchant_name, p_tx.description))']);

select pg_temp.patch_function(
  (select p.oid::regprocedure from pg_proc p where p.proname = 'suggest_account' and p.pronamespace = 'lp_private'::regnamespace),
  array['lp_private.merchant_key(p_text)'],
  array['lp_private.merchant_identity(p_org_id, p_client_id, p_text)']);

select pg_temp.patch_function(
  (select p.oid::regprocedure from pg_proc p where p.proname = 'uncategorize_transaction' and p.pronamespace = 'public'::regnamespace),
  array['lp_private.merchant_key(coalesce(v_tx.merchant_name, v_tx.description))'],
  array['lp_private.merchant_identity(p_org_id, v_tx.client_id, coalesce(v_tx.merchant_name, v_tx.description))']);

select pg_temp.patch_function(
  (select p.oid::regprocedure from pg_proc p where p.proname = 'get_review_queue' and p.pronamespace = 'public'::regnamespace),
  array['lp_private.merchant_key(coalesce(t.merchant_name, t.description)) as merchant_key'],
  array['lp_private.merchant_identity(t.org_id, t.client_id, coalesce(t.merchant_name, t.description)) as merchant_key']);

-- ── Re-key what was learned under the old keys ─────────────────────────────

do $$
declare
  g record;
  v_keep uuid;
begin
  for g in
    select org_id, category, lp_private.merchant_key(keyword) as new_key,
           array_agg(id order by is_rule desc, match_count desc, confirmed_at desc nulls last) as ids
      from public.user_patterns
     where category like 'learned%' and lp_private.merchant_key(keyword) <> ''
     group by org_id, category, lp_private.merchant_key(keyword)
  loop
    v_keep := g.ids[1];
    -- Two old keys that are now one merchant: the strongest wins; confirmations
    -- to the same account add up.
    update public.user_patterns k
       set match_count = k.match_count + coalesce((
             select sum(o.match_count) from public.user_patterns o
              where o.id = any(g.ids[2:]) and o.account_id = k.account_id), 0)
     where k.id = v_keep;
    delete from public.user_patterns where id = any(g.ids[2:]);
    update public.user_patterns
       set keyword = g.new_key, merchant_name = g.new_key
     where id = v_keep and keyword <> g.new_key;
  end loop;
end;
$$;

-- ── The merchant on the transaction row (indexed) ───────────────────────────

alter table public.transactions add column if not exists merchant_key text;
create index if not exists transactions_org_merchant_key
  on public.transactions (org_id, merchant_key) where is_current;
comment on column public.transactions.merchant_key is
  'lp_private.merchant_key(merchant_name or description), stamped on insert. NULL on lines locked before it existed.';

select pg_temp.patch_function('lp_private.trg_evaluate_risk()',
  array['  v := lp_private.evaluate_risk(new);'],
  array[E'  new.merchant_key := lp_private.merchant_key(coalesce(new.merchant_name, new.description));\n  v := lp_private.evaluate_risk(new);']);

select pg_temp.patch_function('lp_private.evaluate_risk(public.transactions)',
  array[
    'v_key      text := lp_private.merchant_key(coalesce(t.merchant_name, t.description));',
    'lp_private.merchant_key(coalesce(o.merchant_name, o.description)) = v_key'
  ],
  array[
    'v_key      text := coalesce(t.merchant_key, lp_private.merchant_key(coalesce(t.merchant_name, t.description)));',
    '(o.merchant_key = v_key or (o.merchant_key is null and lp_private.merchant_key(coalesce(o.merchant_name, o.description)) = v_key))'
  ]);

create or replace function lp_private.refresh_merchant_keys(p_org_id uuid default null)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_n integer;
begin
  update public.transactions t
     set merchant_key = lp_private.merchant_key(coalesce(t.merchant_name, t.description))
   where (p_org_id is null or t.org_id = p_org_id)
     and t.locked_at is null
     and t.merchant_key is distinct from lp_private.merchant_key(coalesce(t.merchant_name, t.description));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function lp_private.refresh_merchant_keys(uuid) from public, anon, authenticated;

select lp_private.refresh_merchant_keys();

-- ── Fix-up (migration brain_f1_star_and_aliases) ────────────────────────────
-- Found testing real bank texts: cutting at '*' BEFORE matching aliases lost
-- the part that names the service ("GOOGLE *ADS123" became just "google"),
-- and "MC DONALDS" (with a space) missed its alias. Aliases now match the
-- whole cleaned text; the cut at '*' only shapes the fallback key of a
-- merchant no alias knows ("ACME*XK12L9" -> "acme").
drop function if exists lp_private.merchant_clean(text);
create or replace function lp_private.merchant_clean(p text, p_cut_at_star boolean default true)
returns text
language plpgsql
immutable
as $$
declare
  s    text := lower(coalesce(p, ''));
  prev text;
begin
  loop
    prev := s;
    s := regexp_replace(s, '^\s*(sq|tst|sp|dd|py|ppl|paypal|pp|ic|bt|sqc)\s*\*\s*', '');
    s := regexp_replace(s, '^\s*(pos|ach|chk|checkcard|check card|debit card purchase|debit purchase|card purchase|'
                        || 'purchase authorized on [0-9/]+|purchase [0-9/]+|recurring payment|recurring|pmt|web|ext|'
                        || 'bill pay|online payment|debit|dbt|visa)\M\s*[-:#]?\s*', '');
    exit when s = prev;
  end loop;
  if p_cut_at_star then
    s := regexp_replace(s, '\*.*$', '');
  end if;
  s := regexp_replace(s, 'www\.', '', 'g');
  s := regexp_replace(s, '\.(com|net|org|io|co|us)\M', ' ', 'g');
  s := regexp_replace(s, '[^a-z& ]+', ' ', 'g');
  s := btrim(regexp_replace(s, '\s+', ' ', 'g'));
  return s;
end;
$$;
revoke all on function lp_private.merchant_clean(text, boolean) from public, anon, authenticated;

update lp_private.merchant_aliases set pattern = '\mmc\s*donald'
 where kind = 'seed' and pattern = '\mmcdonald';

create or replace function lp_private.merchant_key(p text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_full text := lp_private.merchant_clean(p, false);
  c      text;
  v      text;
begin
  if v_full = '' then
    return '';
  end if;
  select a.canonical into v
    from lp_private.merchant_aliases a
   where a.kind = 'seed' and v_full ~ a.pattern
   order by a.priority, a.id
   limit 1;
  if v is not null then
    return v;
  end if;
  c := coalesce(nullif(lp_private.merchant_clean(p, true), ''), v_full);
  return coalesce(array_to_string(array(
    select w
      from unnest(regexp_split_to_array(c, '\s+')) with ordinality as u(w, i)
     where length(w) > 1
       and w not in ('pos','debit','dbt','card','purchase','checkcard','visa','mc','ach','web',
                     'ppd','ccd','recurring','pmt','payment','online','www','com','inc','llc',
                     'co','the','sq','tst','pp','id','ref','xx','xxxx','des','indn','orig','corp','ltd')
     order by i
     limit 2
  ), ' '), '');
end;
$$;

select lp_private.refresh_merchant_keys();
