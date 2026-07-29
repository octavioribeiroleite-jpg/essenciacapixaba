-- Encerra imediatamente o RPC quando o usuário autenticado é administrador.
-- Sem o RETURN explícito, o PL/pgSQL continuava no ramo de vendedor e
-- lançava "Usuário sem papel ativo" mesmo após encontrar o papel admin.
create or replace function public.rpc_actor_context()
returns table(role public.app_role, owner_id uuid, seller_id uuid)
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória';
  end if;

  if private.is_admin(auth.uid()) then
    return query
    select 'admin'::public.app_role, auth.uid(), null::uuid;
    return;
  end if;

  return query
  select 'seller'::public.app_role, s.owner_id, s.id
  from public.sellers_v2 s
  where s.user_id = auth.uid()
    and s.active
  limit 1;

  if not found then
    raise exception 'Usuário sem papel ativo';
  end if;
end
$$;

revoke all on function public.rpc_actor_context() from public, anon;
grant execute on function public.rpc_actor_context() to authenticated;

notify pgrst, 'reload schema';
