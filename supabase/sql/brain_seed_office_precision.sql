-- Walkthrough 2026-09-29: "STAPLES office supplies" was suggested into
-- "6030 Medical Supplies" because the office-store / general-merchandise
-- seeds accepted any account containing "suppl". They now only land on an
-- office or general-supplies account; with none in the chart the transaction
-- simply gets no suggestion (a wrong suggestion is worse than none).
update lp_private.categorization_seeds
   set account_pattern = '(office|^supplies|general supplies|supplies (and|&) materials)'
 where id in (12, 22) and account_pattern = '(office|suppl)';
