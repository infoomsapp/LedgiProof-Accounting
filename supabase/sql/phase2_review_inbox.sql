-- Phase 2: categorize in one click ("For review" inbox).
-- Applied 2026-09-27 as migration `phase2_review_inbox`. Kept here as the
-- reference copy. Depends on `security_rpc_access_guards` (lp_private).
--
-- Before: every transaction needed a debit AND a credit account picked by
-- hand, nothing was learned (learnFromJournalEntry was never called), and
-- posting + approving were separate browser round trips.
--
-- Now:
--   · get_review_queue()           uncategorized transactions, each with a
--                                  suggested category and where it came from.
--   · post_reviewed_transactions() one click or a batch: posts the balanced
--                                  entry (the bank side is implied), marks the
--                                  transaction blue/verified with the same
--                                  audit hash transactions.service writes,
--                                  learns the merchant, and offers a rule the
--                                  second time the same merchant is confirmed.
--   · set_categorization_rule()    turn a learned merchant into a rule (or off).
--
-- Suggestion order: rule > learned > vendor default > known merchants >
-- income fallback. AI fills the rest from the suggest-categories edge function.

alter table public.user_patterns add column if not exists is_rule boolean not null default false;

-- ── Helpers ─────────────────────────────────────────────────────────────────

-- "UBER *TRIP 8XK2 SAN FRANCISCO" -> "uber trip". Digits, punctuation and
-- card/processor noise are dropped; the first two words identify the merchant.
create or replace function lp_private.merchant_key(p text)
returns text
language sql immutable
set search_path = public
as $$
  select coalesce(array_to_string(array(
    select w
      from unnest(regexp_split_to_array(
             regexp_replace(lower(coalesce(p, '')), '[^a-z& ]+', ' ', 'g'), '\s+')
           ) with ordinality as u(w, i)
     where length(w) > 1
       and w not in ('pos','debit','dbt','card','purchase','checkcard','visa','mc','ach','web',
                     'ppd','ccd','recurring','pmt','payment','online','www','com','inc','llc',
                     'co','the','sq','tst','pp','id','ref','xx','xxxx','des','indn','orig')
     order by i
     limit 2
  ), ' '), '')
$$;

-- Leaf (postable) accounts only: a header with children is never a category.
create or replace function lp_private.is_leaf_account(p_account_id uuid)
returns boolean
language sql stable
set search_path = public
as $$
  select not exists (select 1 from public.accounts c where c.parent_id = p_account_id)
$$;

-- The bank/cash account a bank transaction settles against.
create or replace function lp_private.default_cash_account(p_org_id uuid, p_client_id uuid)
returns uuid
language sql stable
set search_path = public
as $$
  select a.id
    from public.accounts a
   where a.org_id = p_org_id
     and a.client_id is not distinct from p_client_id
     and a.is_active
     and a.type = 'asset'
     and lp_private.is_leaf_account(a.id)
     and (a.cash_flow_category = 'cash' or lower(a.name) ~ '(checking|cash|bank)')
   order by (a.cash_flow_category = 'cash') desc nulls last, a.code
   limit 1
$$;

-- ── Suggestions ─────────────────────────────────────────────────────────────

create or replace function lp_private.suggest_account(
  p_org_id    uuid,
  p_client_id uuid,
  p_text      text,
  p_amount    numeric,
  p_vendor_id uuid
)
returns table(account_id uuid, source text, confidence integer)
language plpgsql stable
set search_path = public
as $$
declare
  v_key  text := lp_private.merchant_key(p_text);
  v_text text := lower(coalesce(p_text, ''));
  v_cat  text := case when p_client_id is null then 'learned' else 'learned:' || p_client_id end;
  v_id   uuid;
  v_rule boolean;
  v_n    integer;
  h      record;
begin
  -- 1-2. A rule or something this workspace has already taught us.
  if v_key <> '' then
    select up.account_id, up.is_rule, up.match_count into v_id, v_rule, v_n
      from public.user_patterns up
      join public.accounts a on a.id = up.account_id
     where up.org_id = p_org_id
       and up.category = v_cat
       and up.keyword = v_key
       and up.is_active
       and a.is_active
       and a.client_id is not distinct from p_client_id
     limit 1;
    if v_id is not null then
      return query select v_id,
                          case when v_rule then 'rule' else 'learned' end,
                          case when v_rule then 99 else least(97, 70 + 8 * coalesce(v_n, 1)) end;
      return;
    end if;
  end if;

  -- 3. The vendor's default expense account.
  if p_vendor_id is not null and p_amount < 0 then
    select v.default_expense_account_id into v_id
      from public.vendors v
      join public.accounts a on a.id = v.default_expense_account_id
     where v.id = p_vendor_id and v.org_id = p_org_id and a.is_active;
    if v_id is not null then
      return query select v_id, 'vendor'::text, 85;
      return;
    end if;
  end if;

  -- 4. Well-known merchants -> the first matching account in this chart.
  for h in
    select * from (values
      ( 1, '(ubereats|uber eats|doordash|grubhub|postmates|starbucks|mcdonald|chipotle|restaurant|\mcafe\M|coffee|pizza|burger|taco|dunkin|panera|subway)', '(meal)', -1),
      ( 2, '(amazon web services|\maws\M|adobe|google (workspace|cloud|gsuite|storage)|microsoft|github|slack|zoom\.us|\mzoom\M|dropbox|notion|figma|canva|openai|anthropic|intuit|quickbooks|shopify|squarespace|\mwix\M|godaddy|atlassian|hubspot|apple\.com|icloud|netflix|spotify)', '(software|subscription)', -1),
      ( 3, '(google ads|facebook|\mmeta\M|fb ads|linkedin|\myelp\M|instagram|tiktok|mailchimp)', '(advertis|marketing)', -1),
      ( 4, '(\muber\M|\mlyft\M|\mtaxi|airbnb|\mdelta\M|united air|american air|southwest|jetblue|marriott|hilton|hyatt|expedia|booking\.com|\mhotel|airline|amtrak|parking)', '(travel)', -1),
      ( 5, '(\mshell\M|chevron|exxon|\mmobil\M|texaco|sunoco|valero|marathon|speedway|citgo|\mwawa\M|circle k|\mfuel)', '(car|truck|vehicle|auto|fuel|\mgas)', -1),
      ( 6, '(verizon|at&t|\matt\M|t.mobile|comcast|xfinity|spectrum|cox comm|frontier|wireless|internet)', '(telephone|phone|internet|utilit)', -1),
      ( 7, '(electric|\mpower\M|energy|\mwater\M|utilit|pg&e|coned|duke energy)', '(utilit)', -1),
      ( 8, '(geico|state farm|progressive|allstate|insurance|liberty mutual|nationwide)', '(insurance| ins$| ins )', -1),
      ( 9, '(gusto|\madp\M|paychex|payroll)', '(wage|salar|payroll)', -1),
      (10, '(\mrent\M|\mlease\M|property m)', '(\mrent|lease)', -1),
      (11, '(service charge|monthly fee|overdraft|wire fee|atm fee|bank fee|maintenance fee|stripe fee|paypal fee)', '(bank|fee)', -1),
      (12, '(staples|office depot|officemax|home depot|lowe|walmart|\mtarget\M|costco|amazon|best buy)', '(office|suppl)', -1),
      (13, '(\mirs\M|\mtax\M|\mdmv\M|license|permit)', '(tax|license)', -1),
      (14, '(attorney|law office|\mlegal\M|\mcpa\M|accounting|bookkeeping)', '(legal|professional|accounting)', -1),
      (20, '(deposit|stripe|square|paypal|venmo|zelle|shopify|payout|transfer from|client payment|\minvoice)', '(revenue|sales|fee|income)', 1)
    ) as t(ord, merchant, acct, sign)
    order by ord
  loop
    continue when sign(p_amount) <> h.sign or v_text !~ h.merchant;
    select a.id into v_id
      from public.accounts a
     where a.org_id = p_org_id
       and a.client_id is not distinct from p_client_id
       and a.is_active
       and a.type = case when h.sign < 0 then 'expense' else 'income' end
       and lower(a.name) ~ h.acct
       and lp_private.is_leaf_account(a.id)
     order by a.code
     limit 1;
    if v_id is not null then
      return query select v_id, 'merchant'::text, 60;
      return;
    end if;
  end loop;

  -- 5. Money in with nothing better: the first revenue account.
  if p_amount > 0 then
    select a.id into v_id
      from public.accounts a
     where a.org_id = p_org_id
       and a.client_id is not distinct from p_client_id
       and a.is_active
       and a.type = 'income'
       and lp_private.is_leaf_account(a.id)
     order by a.code
     limit 1;
    if v_id is not null then
      return query select v_id, 'income'::text, 40;
    end if;
  end if;
end;
$$;

-- ── The inbox ───────────────────────────────────────────────────────────────

create or replace function public.get_review_queue(
  p_org_id    uuid,
  p_client_id uuid default null,
  p_limit     integer default 100
)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_items jsonb;
  v_total integer;
begin
  perform lp_private.assert_org_access(p_org_id);

  select count(*) into v_total
    from public.transactions t
   where t.org_id = p_org_id
     and t.client_id is not distinct from p_client_id
     and t.is_current
     and t.locked_at is null
     and not exists (select 1 from public.journal_entries je
                      where je.transaction_id = t.id and not je.is_reversed);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.transaction_date desc, x.created_at desc), '[]'::jsonb)
    into v_items
    from (
      select t.id, t.transaction_date, t.created_at, t.description, t.merchant_name,
             t.amount, t.currency, t.semaphore, t.status_reason,
             lp_private.merchant_key(coalesce(t.merchant_name, t.description)) as merchant_key,
             s.account_id  as suggested_account_id,
             s.source      as suggestion_source,
             s.confidence  as suggestion_confidence,
             a.code        as suggested_account_code,
             a.name        as suggested_account_name
        from public.transactions t
        left join lateral lp_private.suggest_account(
               t.org_id, t.client_id, coalesce(t.merchant_name, t.description), t.amount, t.vendor_id) s on true
        left join public.accounts a on a.id = s.account_id
       where t.org_id = p_org_id
         and t.client_id is not distinct from p_client_id
         and t.is_current
         and t.locked_at is null
         and not exists (select 1 from public.journal_entries je
                          where je.transaction_id = t.id and not je.is_reversed)
       order by t.transaction_date desc, t.created_at desc
       limit least(greatest(coalesce(p_limit, 100), 1), 200)
    ) x;

  return jsonb_build_object(
    'items',        v_items,
    'total',        v_total,
    'bank_account', lp_private.default_cash_account(p_org_id, p_client_id)
  );
end;
$$;

-- ── One click (or a batch) ──────────────────────────────────────────────────
-- p_items: [{ "transaction_id": uuid, "account_id": uuid,
--             "bank_account_id"?: uuid, "source"?: text }]
-- Each item is its own savepoint: one bad item never fails the batch.

create or replace function public.post_reviewed_transactions(p_org_id uuid, p_items jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_item    jsonb;
  v_tx      public.transactions%rowtype;
  v_acct    public.accounts%rowtype;
  v_bank    uuid;
  v_amt     numeric;
  v_usd     numeric;
  v_rate    numeric;
  v_cur     text;
  v_prev    text;
  v_now     timestamptz;
  v_hash    text;
  v_key     text;
  v_cat     text;
  v_count   integer;
  v_is_rule boolean;
  v_posted  jsonb := '[]'::jsonb;
  v_failed  jsonb := '[]'::jsonb;
  v_prompts jsonb := '[]'::jsonb;
begin
  -- Same roles the journal_entries write policy allows.
  perform lp_private.assert_org_access(p_org_id, array['owner','admin','accountant']::public.lp_role[]);
  if v_uid is null then
    raise exception 'A signed-in user is required to verify transactions' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('posted', v_posted, 'failed', v_failed, 'rule_prompts', v_prompts);
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'At most 200 transactions per batch' using errcode = '22023';
  end if;

  -- The org's audit chain is linear: one writer at a time.
  perform pg_advisory_xact_lock(hashtextextended('audit_events:' || p_org_id::text, 0));

  for v_item in select * from jsonb_array_elements(p_items) loop
    begin
      select * into v_tx
        from public.transactions
       where id = (v_item ->> 'transaction_id')::uuid
         and org_id = p_org_id
         and is_current
       for update;
      if not found then
        raise exception 'Transaction not found';
      end if;
      if v_tx.locked_at is not null then
        raise exception 'This transaction is locked';
      end if;
      if exists (select 1 from public.journal_entries je
                  where je.transaction_id = v_tx.id and not je.is_reversed) then
        raise exception 'Already categorized';
      end if;

      select * into v_acct
        from public.accounts
       where id = (v_item ->> 'account_id')::uuid
         and org_id = p_org_id
         and client_id is not distinct from v_tx.client_id
         and is_active;
      if not found then
        raise exception 'Choose a category from this workspace''s chart of accounts';
      end if;
      if not lp_private.is_leaf_account(v_acct.id) then
        raise exception 'Choose a specific account, not a group heading';
      end if;

      v_bank := nullif(v_item ->> 'bank_account_id', '')::uuid;
      if v_bank is not null and not exists (
        select 1 from public.accounts
         where id = v_bank and org_id = p_org_id
           and client_id is not distinct from v_tx.client_id and is_active
      ) then
        raise exception 'That bank account is not part of this workspace';
      end if;
      v_bank := coalesce(v_bank, lp_private.default_cash_account(p_org_id, v_tx.client_id));
      if v_bank is null then
        raise exception 'Add a bank or cash account to your chart of accounts first';
      end if;
      if v_bank = v_acct.id then
        raise exception 'The category can''t be the bank account itself';
      end if;

      v_amt := abs(v_tx.amount);
      if v_amt = 0 then
        raise exception 'A zero-amount transaction has nothing to post';
      end if;
      v_cur := upper(coalesce(v_tx.currency, 'USD'));
      if v_cur = 'USD' then
        v_usd := v_amt;
      else
        select usd_rate into v_rate from public.exchange_rates where currency = v_cur;
        if v_rate is null or v_rate = 0 then
          raise exception 'No exchange rate available for %', v_cur;
        end if;
        v_usd := round(v_amt / v_rate, 2);
      end if;

      -- Money out: debit the category, credit the bank. Money in: the reverse.
      insert into public.journal_entries (
        transaction_id, entry_kind, account_id, entry_type, amount, amount_usd,
        currency, memo, period_year, period_month
      ) values
        (v_tx.id, 'transaction_linked', case when v_tx.amount < 0 then v_acct.id else v_bank end,
         'debit',  v_amt, v_usd, v_cur, v_tx.description,
         extract(year from v_tx.transaction_date)::int, extract(month from v_tx.transaction_date)::int),
        (v_tx.id, 'transaction_linked', case when v_tx.amount < 0 then v_bank else v_acct.id end,
         'credit', v_amt, v_usd, v_cur, v_tx.description,
         extract(year from v_tx.transaction_date)::int, extract(month from v_tx.transaction_date)::int);

      -- Verified (blue) + audit event, hashed exactly like
      -- transactions.service.ts approveTransaction() -> buildAuditHash():
      -- sha256(JSON.stringify({previousHash, transactionId,
      --   transactionVersion, eventType, timestamp, actorId})).
      v_now := clock_timestamp();
      update public.transactions
         set semaphore     = 'blue',
             approved_by   = v_uid,
             approved_at   = v_now,
             review_status = 'confirmed'
       where id = v_tx.id;

      select entry_hash into v_prev
        from public.audit_events
       where org_id = p_org_id
       order by created_at desc, id desc
       limit 1;

      v_hash := public.sha256_text(
        '{"previousHash":'        || coalesce(to_json(v_prev)::text, 'null') ||
        ',"transactionId":'       || to_json(v_tx.id::text)::text ||
        ',"transactionVersion":'  || v_tx.version ||
        ',"eventType":"approved"' ||
        ',"timestamp":'           || to_json(to_char(v_now at time zone 'UTC',
                                       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text ||
        ',"actorId":'             || to_json(v_uid::text)::text || '}'
      );

      insert into public.audit_events (
        org_id, transaction_id, transaction_group_id, transaction_version,
        event_type, actor_id, previous_hash, entry_hash, metadata, created_at
      ) values (
        p_org_id, v_tx.id, v_tx.transaction_group_id, v_tx.version,
        'approved', v_uid, v_prev, v_hash,
        jsonb_build_object(
          'note',                'Categorized from the review inbox',
          'prev_semaphore',      v_tx.semaphore,
          'category_account_id', v_acct.id,
          'bank_account_id',     v_bank,
          'suggestion_source',   v_item ->> 'source'
        ),
        v_now
      );

      -- Learn the merchant (per client in a firm: accounts are per client).
      v_key := lp_private.merchant_key(coalesce(v_tx.merchant_name, v_tx.description));
      if v_key <> '' then
        v_cat := case when v_tx.client_id is null then 'learned' else 'learned:' || v_tx.client_id end;
        insert into public.user_patterns (
          org_id, created_by, keyword, merchant_name, account_id, category,
          confidence_boost, match_count, is_active, confirmed_at
        ) values (
          p_org_id, v_uid, v_key, v_key, v_acct.id, v_cat, 20, 1, true, v_now
        )
        on conflict (org_id, keyword, category) do update set
          match_count      = case when user_patterns.account_id = excluded.account_id
                                  then user_patterns.match_count + 1 else 1 end,
          confidence_boost = least(50, case when user_patterns.account_id = excluded.account_id
                                            then user_patterns.confidence_boost + 5 else 20 end),
          is_rule          = case when user_patterns.account_id = excluded.account_id
                                  then user_patterns.is_rule else false end,
          account_id       = excluded.account_id,
          is_active        = true,
          confirmed_at     = excluded.confirmed_at
        returning match_count, is_rule into v_count, v_is_rule;

        -- Second time the same merchant lands in the same account: offer a rule.
        if v_count = 2 and not v_is_rule then
          v_prompts := v_prompts || jsonb_build_object(
            'merchant_key', v_key,
            'client_id',    v_tx.client_id,
            'account_id',   v_acct.id,
            'account_name', v_acct.name,
            'example',      coalesce(v_tx.merchant_name, v_tx.description)
          );
        end if;
      end if;

      v_posted := v_posted || to_jsonb(v_tx.id);
    exception when others then
      v_failed := v_failed || jsonb_build_object(
        'transaction_id', v_item ->> 'transaction_id',
        'error',          sqlerrm
      );
    end;
  end loop;

  return jsonb_build_object('posted', v_posted, 'failed', v_failed, 'rule_prompts', v_prompts);
end;
$$;

-- ── Rules ───────────────────────────────────────────────────────────────────

create or replace function public.set_categorization_rule(
  p_org_id       uuid,
  p_client_id    uuid,
  p_merchant_key text,
  p_account_id   uuid,
  p_is_rule      boolean default true
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_cat text := case when p_client_id is null then 'learned' else 'learned:' || p_client_id end;
begin
  perform lp_private.assert_org_access(p_org_id, array['owner','admin','accountant']::public.lp_role[]);
  if coalesce(btrim(p_merchant_key), '') = '' then
    raise exception 'Missing merchant' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.accounts
     where id = p_account_id and org_id = p_org_id
       and client_id is not distinct from p_client_id and is_active
  ) then
    raise exception 'Choose a category from this workspace''s chart of accounts' using errcode = '22023';
  end if;

  insert into public.user_patterns (
    org_id, created_by, keyword, merchant_name, account_id, category,
    confidence_boost, match_count, is_active, is_rule, confirmed_at
  ) values (
    p_org_id, auth.uid(), p_merchant_key, p_merchant_key, p_account_id, v_cat,
    50, 1, true, p_is_rule, now()
  )
  on conflict (org_id, keyword, category) do update set
    account_id   = excluded.account_id,
    is_rule      = excluded.is_rule,
    is_active    = true,
    confirmed_at = excluded.confirmed_at;
end;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────

revoke all on function lp_private.merchant_key(text)                              from public, anon, authenticated;
revoke all on function lp_private.is_leaf_account(uuid)                           from public, anon, authenticated;
revoke all on function lp_private.default_cash_account(uuid, uuid)                from public, anon, authenticated;
revoke all on function lp_private.suggest_account(uuid, uuid, text, numeric, uuid) from public, anon, authenticated;
grant execute on all functions in schema lp_private to service_role;

revoke all on function public.get_review_queue(uuid, uuid, integer)                        from public, anon;
revoke all on function public.post_reviewed_transactions(uuid, jsonb)                      from public, anon;
revoke all on function public.set_categorization_rule(uuid, uuid, text, uuid, boolean)     from public, anon;
grant execute on function public.get_review_queue(uuid, uuid, integer)                     to authenticated, service_role;
grant execute on function public.post_reviewed_transactions(uuid, jsonb)                   to authenticated, service_role;
grant execute on function public.set_categorization_rule(uuid, uuid, text, uuid, boolean)  to authenticated, service_role;
