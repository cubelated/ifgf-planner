create index if not exists line_unavailability_broadcasts_request_id_idx
  on public.line_unavailability_broadcasts (request_id);

create index if not exists line_unavailability_broadcasts_event_id_idx
  on public.line_unavailability_broadcasts (event_id);

create index if not exists line_unavailability_broadcasts_created_by_idx
  on public.line_unavailability_broadcasts (created_by);
