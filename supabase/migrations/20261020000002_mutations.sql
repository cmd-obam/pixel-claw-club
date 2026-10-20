-- Record mutations, revenge completion, and village sync.
-- These functions are the only write path for play sessions and private amounts.

CREATE OR REPLACE FUNCTION public.sync_village()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gid uuid := public.my_group_id();
  cnt integer;
  lvl integer;
BEGIN
  IF gid IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT count(*) INTO cnt
  FROM public.prizes
  WHERE group_id = gid AND deleted_at IS NULL AND visibility = 'GROUP';
  SELECT level INTO lvl
  FROM public.village_level_thresholds
  WHERE min_prizes <= cnt AND (max_prizes IS NULL OR max_prizes >= cnt);
  INSERT INTO public.village_states (group_id, current_level, unlocked_level)
  VALUES (gid, COALESCE(lvl, 1), COALESCE(lvl, 1))
  ON CONFLICT (group_id) DO UPDATE
  SET current_level = EXCLUDED.current_level,
      unlocked_level = GREATEST(public.village_states.unlocked_level, EXCLUDED.current_level),
      updated_at = now();
  DELETE FROM public.village_characters AS character
  WHERE character.group_id = gid
    AND NOT EXISTS (
      SELECT 1 FROM public.prizes AS prize
      WHERE prize.id = character.prize_id
        AND prize.deleted_at IS NULL
        AND prize.visibility = 'GROUP'
    );
  INSERT INTO public.village_characters (
    id, group_id, prize_id, owner_member_id, display_name, col, row
  )
  SELECT prize.id, prize.group_id, prize.id, prize.owner_member_id, prize.name,
         ((row_number() OVER (ORDER BY prize.created_at))::integer - 1) % 12,
         9
  FROM public.prizes AS prize
  WHERE prize.group_id = gid
    AND prize.deleted_at IS NULL
    AND prize.visibility = 'GROUP'
    AND NOT EXISTS (
      SELECT 1 FROM public.village_characters AS character WHERE character.prize_id = prize.id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_play_record(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  uid uuid := auth.uid();
  gid uuid;
  store_id uuid;
  visit_id uuid;
  played timestamptz;
  attempts integer;
  wins integer;
  amount integer;
  idem text;
  payload_hash text;
  existing public.play_records%ROWTYPE;
  spent integer;
  budget integer;
  week_start timestamptz;
  fingerprint text;
  projected integer;
  new_id uuid;
  prize jsonb;
  design_id uuid;
  design_name text;
  prize_count integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  gid := public.my_group_id();
  IF gid IS NULL THEN
    RAISE EXCEPTION 'not a member';
  END IF;
  PERFORM 1 FROM public.groups WHERE id = gid FOR UPDATE;
  store_id := (p_payload->>'store_id')::uuid;
  played := (p_payload->>'played_at')::timestamptz;
  attempts := (p_payload->>'attempt_count')::integer;
  wins := (p_payload->>'win_count')::integer;
  amount := (p_payload->>'amount_spent')::integer;
  idem := p_payload->>'idempotency_key';
  prize_count := jsonb_array_length(coalesce(p_payload->'prizes', '[]'::jsonb));
  IF attempts < 1 OR wins < 0 OR wins > attempts OR amount < 0 OR amount > 10000000 OR prize_count > wins THEN
    RAISE EXCEPTION 'invalid play values';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = store_id AND group_id = gid AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'store not found';
  END IF;
  payload_hash := encode(digest(convert_to((p_payload - 'confirm_fingerprint')::text, 'UTF8'), 'sha256'), 'hex');
  SELECT * INTO existing
  FROM public.play_records
  WHERE created_by = uid AND idempotency_key = idem;
  IF FOUND THEN
    IF existing.payload_hash IS DISTINCT FROM payload_hash THEN
      RAISE EXCEPTION 'duplicate submission mismatch';
    END IF;
    RETURN jsonb_build_object('status', 'saved', 'record_id', existing.id, 'idempotent', true);
  END IF;
  spent := public.my_week_spent(played, NULL);
  SELECT weekly_budget_krw INTO budget FROM public.budget_settings WHERE member_id = uid;
  week_start := public.seoul_week_start(played);
  projected := spent + amount;
  fingerprint := public.budget_fingerprint(uid, week_start, spent, amount, budget, NULL);
  IF projected > budget AND coalesce(p_payload->>'confirm_fingerprint', '') IS DISTINCT FROM fingerprint THEN
    RETURN jsonb_build_object(
      'status', 'confirmation_required',
      'fingerprint', fingerprint,
      'spent_before', spent,
      'projected', projected,
      'budget', budget,
      'excess', projected - budget
    );
  END IF;
  IF coalesce(p_payload->>'visit_id', '') <> '' THEN
    visit_id := (p_payload->>'visit_id')::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM public.visits
      WHERE id = visit_id AND group_id = gid AND member_id = uid
        AND store_id = store_id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'visit not found';
    END IF;
  ELSE
    INSERT INTO public.visits (group_id, store_id, member_id, visited_at, created_by)
    VALUES (gid, store_id, uid, played, uid)
    RETURNING id INTO visit_id;
  END IF;
  INSERT INTO public.play_records (
    group_id, visit_id, player_id, created_by, played_at, attempt_count, win_count,
    notes, machine_label, idempotency_key, payload_hash
  ) VALUES (
    gid, visit_id, uid, uid, played, attempts, wins,
    left(coalesce(p_payload->>'notes', ''), 500),
    left(coalesce(p_payload->>'machine_label', ''), 40),
    idem, payload_hash
  ) RETURNING id INTO new_id;
  INSERT INTO public.financial_records (play_record_id, group_id, owner_member_id, amount_spent)
  VALUES (new_id, gid, uid, amount);
  FOR prize IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'prizes', '[]'::jsonb))
  LOOP
    design_name := btrim(prize->>'name');
    IF design_name = '' THEN
      RAISE EXCEPTION 'prize name required';
    END IF;
    SELECT id INTO design_id FROM public.prize_designs
    WHERE group_id = gid AND lower(name) = lower(design_name);
    IF design_id IS NULL THEN
      INSERT INTO public.prize_designs (group_id, name, category, description)
      VALUES (
        gid, design_name,
        coalesce(nullif(prize->>'category', ''), '기타'),
        coalesce(prize->>'description', '')
      )
      RETURNING id INTO design_id;
    END IF;
    INSERT INTO public.prizes (
      group_id, owner_member_id, prize_design_id, acquisition_play_record_id,
      acquired_at, name, description, visibility
    ) VALUES (
      gid, uid, design_id, new_id, played, design_name,
      coalesce(prize->>'description', ''),
      CASE WHEN prize->>'visibility' = 'GROUP' THEN 'GROUP' ELSE 'PRIVATE' END
    );
  END LOOP;
  PERFORM public.sync_village();
  INSERT INTO public.audit_events (group_id, actor_id, action, entity_type, entity_id)
  VALUES (gid, uid, 'play_record_saved', 'play_records', new_id);
  RETURN jsonb_build_object('status', 'saved', 'record_id', new_id, 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_play_record_deleted(p_id uuid, p_deleted boolean, p_fingerprint text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  rec public.play_records%ROWTYPE;
  amount integer;
  spent integer;
  budget integer;
  fingerprint text;
  projected integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO rec FROM public.play_records WHERE id = p_id AND player_id = uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'record not found';
  END IF;
  PERFORM 1 FROM public.groups WHERE id = rec.group_id FOR UPDATE;
  SELECT amount_spent INTO amount FROM public.financial_records WHERE play_record_id = rec.id;
  IF p_deleted THEN
    UPDATE public.play_records SET deleted_at = COALESCE(deleted_at, now()) WHERE id = rec.id;
    UPDATE public.prizes
    SET acquisition_play_record_id = NULL,
        unlink_note = '기록 삭제로 획득 연결이 해제되었습니다. 인형은 삭제되지 않았습니다.'
    WHERE acquisition_play_record_id = rec.id;
    UPDATE public.revenge_targets
    SET needs_review = true
    WHERE completion_play_record_id = rec.id AND status = 'COMPLETED';
    RETURN jsonb_build_object('status', 'saved', 'record_id', rec.id);
  END IF;
  spent := public.my_week_spent(rec.played_at, rec.id);
  SELECT weekly_budget_krw INTO budget FROM public.budget_settings WHERE member_id = uid;
  projected := spent + COALESCE(amount, 0);
  fingerprint := public.budget_fingerprint(uid, public.seoul_week_start(rec.played_at), spent, COALESCE(amount, 0), budget, rec.id);
  IF projected > budget AND coalesce(p_fingerprint, '') IS DISTINCT FROM fingerprint THEN
    RETURN jsonb_build_object(
      'status', 'confirmation_required',
      'fingerprint', fingerprint,
      'spent_before', spent,
      'projected', projected,
      'budget', budget,
      'excess', projected - budget
    );
  END IF;
  UPDATE public.play_records SET deleted_at = NULL WHERE id = rec.id;
  RETURN jsonb_build_object('status', 'saved', 'record_id', rec.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_revenge(p_target uuid, p_record uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  target public.revenge_targets%ROWTYPE;
  rec public.play_records%ROWTYPE;
  store_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO target FROM public.revenge_targets WHERE id = p_target AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.is_active_member(target.group_id) THEN
    RAISE EXCEPTION 'target not found';
  END IF;
  IF target.created_by <> uid AND target.assigned_member_id <> uid AND NOT public.is_group_owner(target.group_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO rec FROM public.play_records WHERE id = p_record AND group_id = target.group_id AND deleted_at IS NULL;
  IF NOT FOUND OR rec.win_count < 1 OR rec.player_id <> target.assigned_member_id THEN
    RAISE EXCEPTION 'winning record required';
  END IF;
  SELECT v.store_id INTO store_id FROM public.visits v WHERE v.id = rec.visit_id;
  IF store_id IS DISTINCT FROM target.store_id THEN
    RAISE EXCEPTION 'store mismatch';
  END IF;
  IF target.status = 'COMPLETED' AND target.completion_play_record_id = p_record AND target.needs_review = false THEN
    RETURN;
  END IF;
  IF target.status = 'ABANDONED' THEN
    RAISE EXCEPTION 'abandoned target';
  END IF;
  IF target.status = 'COMPLETED' AND target.needs_review = false AND target.completion_play_record_id IS DISTINCT FROM p_record THEN
    RAISE EXCEPTION 'already completed';
  END IF;
  UPDATE public.revenge_targets
  SET status = 'COMPLETED',
      completed_at = now(),
      completion_play_record_id = p_record,
      needs_review = false,
      updated_at = now()
  WHERE id = target.id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_village() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_play_record(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_play_record_deleted(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_revenge(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_village() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_play_record(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_play_record_deleted(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_revenge(uuid, uuid) TO authenticated;
