-- The gateway requires the existing legacy anon JWT in Authorization, as well as apikey.
-- The workers additionally validate the separate random maintenance credential.
do $migration$
declare signature text; definition text; updated_definition text;
begin
  foreach signature in array array['private.dispatch_planner_maintenance(boolean)', 'private.dispatch_due_line_reminders()'] loop
    select pg_get_functiondef(signature::regprocedure) into definition;
    updated_definition := replace(definition,
      $needle$jsonb_build_object('Content-Type', 'application/json', 'apikey', publishable_key)$needle$,
      $replacement$jsonb_build_object('Content-Type', 'application/json', 'apikey', publishable_key, 'Authorization', 'Bearer ' || publishable_key)$replacement$);
    if updated_definition = definition then raise exception 'Expected dispatcher header expression was not found: %', signature; end if;
    execute updated_definition;
  end loop;
end;
$migration$;
