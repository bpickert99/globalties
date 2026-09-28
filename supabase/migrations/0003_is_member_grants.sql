-- is_member() is only needed by signed-in users (RLS policies).
revoke execute on function is_member() from public, anon;
