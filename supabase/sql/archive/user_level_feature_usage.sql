-- ARCHIVED -- dropped by plan_limits_server.sql. Kept verbatim so the drop is
-- reversible. Not applied anywhere.
--
-- Why they were removed: a second, per-USER plan system running next to the
-- per-ORGANIZATION one (get_org_plan_limits / check_quota / usage_meters).
--   · check_feature_access read the CALLER's own subscription, so a firm's
--     employee (no subscription of their own) fell to "starter" and lost bill
--     tracking and time tracking the firm pays for.
--   · Its trial branch silently downgraded an ended trial to "starter" and
--     rewrote subscriptions.status from a read call, while the paywall treats
--     an ended trial as "expired" -- two answers to "what plan is this?".
--   · usage_tracking (its counter) was never incremented by any caller, so
--     every quota it reported was 0 used.
-- Replaced by lp_private.org_effective_plan / org_feature_limit and the single
-- read RPC public.get_workspace_plan(p_org_id). usage_tracking (0 rows) and
-- its block_direct_usage_write trigger were left in place.

CREATE OR REPLACE FUNCTION public.check_feature_access(p_user_id uuid, p_feature_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform lp_private.assert_is_caller(p_user_id);
  return lp_private.check_feature_access_impl(p_user_id, p_feature_key);
end;
$function$;

CREATE OR REPLACE FUNCTION lp_private.check_feature_access_impl(p_user_id uuid, p_feature_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan         public.subscription_plan;
  v_status       public.subscription_status;
  v_trial_ends   TIMESTAMPTZ;
  v_limit        INTEGER;
  v_enabled      BOOLEAN;
  v_used         INTEGER := 0;
  v_now          TIMESTAMPTZ := NOW();
  v_year         INT := EXTRACT(YEAR FROM v_now);
  v_month        INT := EXTRACT(MONTH FROM v_now);
BEGIN
  IF public.lp_is_billing_exempt(p_user_id) THEN
    RETURN jsonb_build_object('allowed', TRUE, 'plan', 'exempt', 'unlimited', TRUE, 'reason', 'billing_exempt');
  END IF;

  SELECT s.plan, s.status, s.trial_ends_at
    INTO v_plan, v_status, v_trial_ends
    FROM public.subscriptions s
   WHERE s.user_id = p_user_id
   ORDER BY s.created_at DESC
   LIMIT 1;

  IF v_plan IS NULL THEN
    v_plan := 'starter';
    v_status := 'active';
  END IF;

  IF v_status = 'trialing' AND v_trial_ends < v_now THEN
    v_plan := 'starter';
    UPDATE public.subscriptions SET status = 'expired'
     WHERE user_id = p_user_id AND status = 'trialing';
  END IF;

  SELECT pf.limit_value, pf.is_enabled
    INTO v_limit, v_enabled
    FROM public.plan_features pf
   WHERE pf.plan = v_plan AND pf.feature_key = p_feature_key;

  IF NOT FOUND OR NOT v_enabled THEN
    RETURN jsonb_build_object('allowed', FALSE, 'reason', 'feature_disabled_for_plan',
                              'plan', v_plan, 'feature', p_feature_key);
  END IF;

  IF v_limit = 1 AND p_feature_key NOT LIKE '%_per_mo' AND p_feature_key NOT LIKE '%_mb' THEN
    RETURN jsonb_build_object('allowed', TRUE, 'plan', v_plan, 'unlimited', FALSE);
  END IF;

  SELECT COALESCE(count, 0) INTO v_used
    FROM public.usage_tracking
   WHERE user_id = p_user_id AND feature_key = p_feature_key
     AND period_year = v_year AND period_month = v_month;

  RETURN jsonb_build_object('allowed', v_used < v_limit, 'plan', v_plan, 'limit', v_limit,
                            'used', v_used, 'remaining', GREATEST(0, v_limit - v_used));
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_and_consume_feature(p_user_id uuid, p_feature_key text, p_increment integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_res   JSONB;
  v_allow BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized: no session';
  END IF;
  IF auth.uid() <> p_user_id AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'unauthorized: cannot consume on behalf of other user';
  END IF;
  v_res := public.check_feature_access(p_user_id, p_feature_key);
  v_allow := COALESCE((v_res->>'allowed')::BOOLEAN, FALSE);
  IF NOT v_allow THEN
    RETURN v_res || jsonb_build_object('consumed', FALSE);
  END IF;
  PERFORM public.increment_feature_usage(p_user_id, p_feature_key, p_increment);
  RETURN v_res || jsonb_build_object('consumed', TRUE, 'increment', p_increment,
                                     'new_used', COALESCE((v_res->>'used')::INT, 0) + p_increment);
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_feature_usage(p_user_id uuid, p_feature_key text, p_increment integer DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform lp_private.assert_is_caller(p_user_id);
  perform lp_private.increment_feature_usage_impl(p_user_id, p_feature_key, p_increment);
end;
$function$;

CREATE OR REPLACE FUNCTION lp_private.increment_feature_usage_impl(p_user_id uuid, p_feature_key text, p_increment integer DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year  INT := EXTRACT(YEAR FROM NOW());
  v_month INT := EXTRACT(MONTH FROM NOW());
BEGIN
  PERFORM set_config('lp.usage_rpc_context', 'true', TRUE);
  INSERT INTO public.usage_tracking (user_id, feature_key, period_year, period_month, count, last_used_at)
  VALUES (p_user_id, p_feature_key, v_year, v_month, p_increment, NOW())
  ON CONFLICT (user_id, feature_key, period_year, period_month)
  DO UPDATE SET count = usage_tracking.count + p_increment, last_used_at = NOW();
END;
$function$;

CREATE OR REPLACE FUNCTION public.revert_feature_usage(p_user_id uuid, p_feature_key text, p_decrement integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year  INT := EXTRACT(YEAR FROM NOW());
  v_month INT := EXTRACT(MONTH FROM NOW());
  v_new_count INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized: no session';
  END IF;
  IF auth.uid() <> p_user_id AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  PERFORM set_config('lp.usage_rpc_context', 'true', TRUE);
  UPDATE public.usage_tracking
     SET count = GREATEST(0, count - p_decrement)
   WHERE user_id = p_user_id AND feature_key = p_feature_key
     AND period_year = v_year AND period_month = v_month
   RETURNING count INTO v_new_count;
  RETURN jsonb_build_object('reverted', TRUE, 'feature', p_feature_key, 'new_count', COALESCE(v_new_count, 0));
END;
$function$;
