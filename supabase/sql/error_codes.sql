-- One SQLSTATE per distinct error.
-- Applied as migration `error_codes`. Reference copy.
--
-- Before: 31 different messages shared 22023, 4 shared 23514 and 2 shared
-- P0001 -- the apps couldn't tell them apart, so src/lib/errors.ts replaced
-- every one of them with a generic "Something went wrong".
--
-- Convention (src/lib/errors.ts, src/lib/error-codes.test.ts):
--   L + area + 3 digits. A code names exactly one error; the same error raised
--   from several functions keeps the same code ("Document not found").
--   Areas: LA account setup · LB bills · LD documents/receipts · LE estimates
--   · LI invoices · LO opening balances · LQ plan limits · LR reconciliation
--   · LV review inbox · LW vendors/W-9 · LX currencies.
--   Values a message mentions travel as JSON in DETAIL for the translation.
-- Permission errors keep 42501 (one error: "you don't have permission").
--
-- This migration rewrites the errcode of each existing RAISE in place (the
-- statement is matched by its message), and fails if any is not found.

do $$
declare
  m        record;
  f        record;
  v_def    text;
  v_new    text;
  v_hits   integer;
begin
  create temp table _codes(msg text, old_code text, new_code text, extra text) on commit drop;
  insert into _codes values
    ('No exchange rate available for %',                        '22023', 'LX001', $x$, detail = jsonb_build_object('currency', upper(p_currency))::text$x$),
    ('Choose who you keep the books for',                        '22023', 'LA001', ''),
    ('Enter your business name',                                 '22023', 'LA002', ''),
    ('Document not found',                                       'P0002', 'LD001', ''),
    ('This receipt is already linked to a transaction',          '22023', 'LD002', ''),
    ('Enter the receipt total first',                            '22023', 'LD003', ''),
    ('Only receipts can become an expense',                      '22023', 'LD004', ''),
    ('Only receipts can be linked this way',                     '22023', 'LD005', ''),
    ('That transaction already has a receipt',                   '22023', 'LD006', ''),
    ('That transaction was edited; pick its current version',    '22023', 'LD007', ''),
    ('Missing merchant',                                         '22023', 'LV002', ''),
    ('Choose a category from this workspace''''s chart of accounts', '22023', 'LV003', ''),
    ('Items must be a list',                                     '22023', 'LI001', ''),
    ('At most 200 lines per invoice',                            '22023', 'LI002', ''),
    ('Invoice not found',                                        'P0002', 'LI003', ''),
    ('Recurring invoice not found',                              'P0002', 'LI004', ''),
    ('This invoice is % and its items can no longer be changed.', '23514', 'LI005', $x$, detail = jsonb_build_object('status', v_status)::text$x$),
    ('This invoice has payments. Remove them before voiding it.', '23514', 'LI006', ''),
    ('This payment is matched to a bank deposit and can''''t be changed.', '23514', 'LI007', ''),
    ('This payment is matched to a bank deposit. Undo it from the transaction.', '23514', 'LI008', ''),
    ('days_before must be between 0 and 30',                     '22023', 'LI009', ''),
    ('overdue_days: up to 6 values between 1 and 90',            '22023', 'LI010', ''),
    ('Invoice not yet sent',                                     'P0001', 'LI011', ''),
    ('Estimate not found',                                       'P0002', 'LE001', ''),
    ('Estimate not yet sent',                                    'P0001', 'LE002', ''),
    ('Vendor not found',                                         'P0002', 'LW001', ''),
    ('W-9 request not found',                                    'P0002', 'LW002', '');

  for m in select * from _codes loop
    v_hits := 0;
    for f in
      select p.oid, p.oid::regprocedure::text as sig
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'lp_private') and p.prokind = 'f'
         and position(m.msg in pg_get_functiondef(p.oid)) > 0
    loop
      v_def := pg_get_functiondef(f.oid);
      -- raise exception '<msg>'[, args] using errcode = '<old>'
      v_new := regexp_replace(v_def,
        '(raise\s+exception\s+''' ||
          regexp_replace(m.msg, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') ||
          '''[^;]*?errcode\s*=\s*)''' || m.old_code || '''',
        '\1''' || m.new_code || '''' || replace(m.extra, '\', '\\'),
        'gi');
      if v_new <> v_def then
        execute v_new;
        v_hits := v_hits + 1;
      end if;
    end loop;
    if v_hits = 0 then
      raise exception 'error_codes: no RAISE found for "%" (%)', m.msg, m.old_code;
    end if;
  end loop;
end;
$$;
