revoke all on function private.load_unavailability_form(text)
  from public, anon, authenticated;
grant execute on function private.load_unavailability_form(text)
  to service_role;

revoke all on function private.save_unavailability_form(text, text, uuid, date[], text)
  from public, anon, authenticated;
grant execute on function private.save_unavailability_form(text, text, uuid, date[], text)
  to service_role;

revoke all on function public.get_unavailability_form(text)
  from public, anon, authenticated;
grant execute on function public.get_unavailability_form(text)
  to service_role;

revoke all on function public.submit_unavailability_form(text, text, uuid, date[], text)
  from public, anon, authenticated;
grant execute on function public.submit_unavailability_form(text, text, uuid, date[], text)
  to service_role;
