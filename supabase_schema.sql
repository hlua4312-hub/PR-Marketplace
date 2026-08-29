-- ==========================================================================
-- PR MARKETPLACE - SUPABASE SCHEMA
--
-- Paste the whole file into the Supabase SQL Editor and press RUN.
-- It is safe to run more than once.
--
-- Security model, in one line: identity comes from Supabase Auth, and every
-- rule is enforced by row-level security against auth.uid() - never by the
-- browser. The anon key in js/config.js is public by design; these policies
-- are what actually protect the data.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- BEFORE YOU RUN THIS
--
-- Close the app everywhere first: browser tabs, phones, the Android build,
-- anything pointed at this project.
--
-- Renaming a table needs an exclusive lock on it. A running copy of the app
-- holds read locks and opens Realtime subscriptions, and the two can deadlock
-- - Postgres then kills this script. Nothing is half-applied when that
-- happens (the editor runs the file in one transaction, so it all rolls
-- back), but it is easier to close the app than to retry.
--
-- The lock_timeout below turns a deadlock into a plain, readable error after
-- ten seconds instead of a wait. If you see "canceling statement due to lock
-- timeout", something is still connected.
-- --------------------------------------------------------------------------
set lock_timeout = '10s';

-- Last resort, if it still times out with nothing obviously connected: a
-- pooled connection can outlive the browser tab that made it. Run this on its
-- own to see what is holding on --
--
--   select pid, application_name, state, query
--   from pg_stat_activity
--   where datname = current_database() and pid <> pg_backend_pid();
--
-- and this to close them. It disconnects every other client, so do not run it
-- against anything with real users on it --
--
--   select pg_terminate_backend(pid)
--   from pg_stat_activity
--   where datname = current_database() and pid <> pg_backend_pid();


-- --------------------------------------------------------------------------
-- 0. EXTENSIONS
-- --------------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()


-- --------------------------------------------------------------------------
-- 0b. MIGRATION OFF THE OLD SCHEMA
--
-- The first version of this project stored users in a public.users table with
-- a plaintext password column that any holder of the anon key could read, and
-- gave items a TEXT id with a TEXT user_id. None of that can be carried into
-- the new model: identity now lives in auth.users, and a listing's owner has
-- to be a real uuid from there.
--
-- So rather than delete anything, this renames the old tables out of the way
-- and revokes access to them. Your rows are still there under *_legacy if you
-- need them for your report; nothing can read them over the API any more.
--
-- Once you are happy, remove the backups with:
--     drop table if exists public.users_legacy, public.items_legacy,
--                          public.messages_legacy;
-- Dropping users_legacy is worth doing sooner rather than later - it is the
-- table holding the plaintext passwords.
-- --------------------------------------------------------------------------
do $$
declare
    legacy_users_exists boolean;
    legacy_items_is_text boolean;
begin
    select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'users' and column_name = 'password_hash'
    ) into legacy_users_exists;

    select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'items'
          and column_name = 'id' and data_type = 'text'
    ) into legacy_items_is_text;

    if legacy_users_exists then
        execute 'drop policy if exists "Allow public read access to users" on public.users';
        execute 'drop policy if exists "Allow public insert access to users" on public.users';
        execute 'alter table public.users rename to users_legacy';
        execute 'revoke all on public.users_legacy from anon, authenticated';
        execute 'alter table public.users_legacy enable row level security';
        raise notice 'Renamed public.users to public.users_legacy and revoked API access.';
    end if;

    if legacy_items_is_text then
        execute 'drop policy if exists "Allow public read access to items" on public.items';
        execute 'drop policy if exists "Allow validated insert on items" on public.items';
        execute 'drop policy if exists "Allow update only to mark items as sold" on public.items';
        execute 'alter table public.items rename to items_legacy';
        execute 'revoke all on public.items_legacy from anon, authenticated';
        execute 'alter table public.items_legacy enable row level security';
        raise notice 'Renamed public.items to public.items_legacy.';
    end if;

    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'messages' and column_name = 'sender_role'
    ) then
        execute 'drop policy if exists "Allow public read access to messages" on public.messages';
        execute 'drop policy if exists "Allow public insert access to messages" on public.messages';
        execute 'alter table public.messages rename to messages_legacy';
        execute 'revoke all on public.messages_legacy from anon, authenticated';
        execute 'alter table public.messages_legacy enable row level security';
        raise notice 'Renamed public.messages to public.messages_legacy.';
    end if;
end
$$;


-- --------------------------------------------------------------------------
-- 1. PROFILES
--    One row per registered user. Passwords are NOT here - Supabase Auth
--    owns auth.users and stores a bcrypt hash we never see or handle.
-- --------------------------------------------------------------------------
create table if not exists public.profiles (
    id          uuid primary key references auth.users(id) on delete cascade,
    full_name   text not null,
    phone       text unique,
    created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: owner reads own row"     on public.profiles;
drop policy if exists "profiles: owner updates own row"   on public.profiles;
drop policy if exists "profiles: public display names"    on public.profiles;

-- A signed-in user may read their own full row.
create policy "profiles: owner reads own row"
    on public.profiles for select
    using (auth.uid() = id);

-- A signed-in user may correct their own name / phone.
create policy "profiles: owner updates own row"
    on public.profiles for update
    using (auth.uid() = id)
    with check (auth.uid() = id);

-- Rows are created by the trigger below, never by the client.

-- Copy the sign-up metadata into a profile row the moment the account exists.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, full_name, phone)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
        nullif(new.raw_user_meta_data ->> 'phone', '')
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();


-- --------------------------------------------------------------------------
-- 2. SIGN IN BY PHONE NUMBER
--    The app lets people log in with either email or phone. Supabase Auth
--    signs in by email, so we resolve phone -> email through this function.
--    It is SECURITY DEFINER and returns exactly one column, so callers can
--    never read the profiles table itself.
-- --------------------------------------------------------------------------
create or replace function public.email_for_phone(p_phone text)
returns text
language sql
security definer
set search_path = public
as $$
    select u.email
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.phone = regexp_replace(p_phone, '[^0-9]', '', 'g')
    limit 1;
$$;

revoke all on function public.email_for_phone(text) from public;
grant execute on function public.email_for_phone(text) to anon, authenticated;

-- Reject a duplicate phone at sign-up time without exposing the table.
create or replace function public.phone_is_taken(p_phone text)
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.profiles
        where phone = regexp_replace(p_phone, '[^0-9]', '', 'g')
    );
$$;

revoke all on function public.phone_is_taken(text) from public;
grant execute on function public.phone_is_taken(text) to anon, authenticated;


-- --------------------------------------------------------------------------
-- 3. ITEMS
-- --------------------------------------------------------------------------
create table if not exists public.items (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references auth.users(id) on delete cascade,
    title            text not null check (char_length(title) between 3 and 120),
    category         text not null,
    price            numeric(12,2) not null check (price >= 0),
    condition        text not null check (condition in ('Brand New','Like New','Good','Fair')),
    location         text not null,
    description      text check (char_length(description) <= 2000),
    image_url        text,
    payment_qr_url   text,
    seller_name      text not null,
    seller_phone     text,
    seller_whatsapp  text,
    seller_instagram text,
    is_sold          boolean not null default false,
    sold_at          timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    constraint sold_at_matches_is_sold check (
        (is_sold = false and sold_at is null) or
        (is_sold = true  and sold_at is not null)
    )
);

create index if not exists items_created_at_idx on public.items (created_at desc);
create index if not exists items_category_idx   on public.items (category);
create index if not exists items_user_id_idx    on public.items (user_id);

alter table public.items enable row level security;

drop policy if exists "Allow public read access to items"        on public.items;
drop policy if exists "Allow public insert access to items"      on public.items;
drop policy if exists "Allow validated insert on items"          on public.items;
drop policy if exists "Allow public update access to items"      on public.items;
drop policy if exists "Allow update only to mark items as sold"  on public.items;
drop policy if exists "Allow public delete access to items"      on public.items;
drop policy if exists "items: anyone may browse"                 on public.items;
drop policy if exists "items: post as yourself"                  on public.items;
drop policy if exists "items: owner edits own listing"           on public.items;
drop policy if exists "items: owner deletes own listing"         on public.items;

-- Browsing the marketplace does not require an account.
create policy "items: anyone may browse"
    on public.items for select
    using (true);

-- You may only create a listing that belongs to you.
create policy "items: post as yourself"
    on public.items for insert
    to authenticated
    with check (auth.uid() = user_id);

-- Only the seller may edit their listing, and they cannot hand it to someone else.
create policy "items: owner edits own listing"
    on public.items for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- Only the seller may delete their listing.
create policy "items: owner deletes own listing"
    on public.items for delete
    to authenticated
    using (auth.uid() = user_id);

-- Keep updated_at honest.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists items_touch_updated_at on public.items;
create trigger items_touch_updated_at
    before update on public.items
    for each row execute function public.touch_updated_at();


-- --------------------------------------------------------------------------
-- 4. THE 5-HOUR PURGE OF SOLD LISTINGS
--    SECURITY DEFINER so it can delete rows regardless of who calls it,
--    while the RLS policies above still stop anyone deleting by hand.
-- --------------------------------------------------------------------------
create or replace function public.purge_expired_sold_items()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    removed integer;
begin
    with gone as (
        delete from public.items
        where is_sold = true
          and sold_at < now() - interval '5 hours'
        returning 1
    )
    select count(*) into removed from gone;
    return removed;
end;
$$;

revoke all on function public.purge_expired_sold_items() from public;
grant execute on function public.purge_expired_sold_items() to anon, authenticated;

-- Optional: if the pg_cron extension is enabled on your project, this runs
-- the purge every 15 minutes so it does not depend on someone opening the app.
-- Enable pg_cron under Database > Extensions first, then uncomment:
--
-- select cron.schedule('purge-sold-items', '*/15 * * * *',
--                      $$select public.purge_expired_sold_items()$$);


-- --------------------------------------------------------------------------
-- 5. MESSAGES
--    One table serves all three conversations in the app:
--      community            - the public room, channel_id = 'community'
--      item:<itemId>:<uid>  - a buyer's thread about one listing
--      direct               - channel_id = '<uuidA>:<uuidB>', sorted
-- --------------------------------------------------------------------------
create table if not exists public.messages (
    id           uuid primary key default gen_random_uuid(),
    channel_type text not null check (channel_type in ('community','item','direct')),
    channel_id   text not null,
    sender_id    uuid not null references auth.users(id) on delete cascade,
    sender_name  text not null,
    body         text not null check (char_length(body) between 1 and 2000),
    created_at   timestamptz not null default now()
);

create index if not exists messages_channel_idx on public.messages (channel_type, channel_id, created_at);

alter table public.messages enable row level security;

drop policy if exists "Allow public read access to messages"   on public.messages;
drop policy if exists "Allow public insert access to messages" on public.messages;
drop policy if exists "messages: read your conversations"      on public.messages;
drop policy if exists "messages: send as yourself"             on public.messages;

-- You can read the community room, any listing thread you are part of
-- (as the buyer who started it or as the seller of that item), and your
-- own direct conversations. Nothing else.
create policy "messages: read your conversations"
    on public.messages for select
    to authenticated
    using (
        channel_type = 'community'
        or sender_id = auth.uid()
        or (
            channel_type = 'direct'
            and auth.uid()::text = any (string_to_array(channel_id, ':'))
        )
        or (
            channel_type = 'item'
            and (
                split_part(channel_id, ':', 2) = auth.uid()::text
                or exists (
                    select 1 from public.items i
                    where i.id::text = split_part(channel_id, ':', 1)
                      and i.user_id = auth.uid()
                )
            )
        )
    );

-- You may only send messages signed with your own id, and only into a
-- direct conversation you are actually one half of.
create policy "messages: send as yourself"
    on public.messages for insert
    to authenticated
    with check (
        sender_id = auth.uid()
        and (
            channel_type <> 'direct'
            or auth.uid()::text = any (string_to_array(channel_id, ':'))
        )
    );


-- --------------------------------------------------------------------------
-- 6. REPORTS
--    Lets a buyer flag a listing. Reports are write-only from the client:
--    you can file one, you cannot read anyone else's.
-- --------------------------------------------------------------------------
create table if not exists public.reports (
    id          uuid primary key default gen_random_uuid(),
    item_id     uuid not null references public.items(id) on delete cascade,
    reporter_id uuid not null references auth.users(id) on delete cascade,
    reason      text not null check (char_length(reason) between 3 and 500),
    created_at  timestamptz not null default now(),
    unique (item_id, reporter_id)
);

alter table public.reports enable row level security;

drop policy if exists "reports: file a report"  on public.reports;
drop policy if exists "reports: read your own"  on public.reports;

create policy "reports: file a report"
    on public.reports for insert
    to authenticated
    with check (auth.uid() = reporter_id);

create policy "reports: read your own"
    on public.reports for select
    to authenticated
    using (auth.uid() = reporter_id);


-- --------------------------------------------------------------------------
-- 7. IMAGE STORAGE
--    Photos live in Storage as real files, not as base64 text in a column.
--    Each user writes only inside a folder named after their own user id.
-- --------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'listing-images',
    'listing-images',
    true,
    5242880,                                              -- 5 MB
    array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "listing images are publicly readable" on storage.objects;
drop policy if exists "users upload into their own folder"   on storage.objects;
drop policy if exists "users replace their own images"       on storage.objects;
drop policy if exists "users delete their own images"        on storage.objects;

create policy "listing images are publicly readable"
    on storage.objects for select
    using (bucket_id = 'listing-images');

create policy "users upload into their own folder"
    on storage.objects for insert
    to authenticated
    with check (
        bucket_id = 'listing-images'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

create policy "users replace their own images"
    on storage.objects for update
    to authenticated
    using (
        bucket_id = 'listing-images'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

create policy "users delete their own images"
    on storage.objects for delete
    to authenticated
    using (
        bucket_id = 'listing-images'
        and (storage.foldername(name))[1] = auth.uid()::text
    );


-- --------------------------------------------------------------------------
-- 8. REALTIME
--    Lets the app receive new messages and listings without polling.
-- --------------------------------------------------------------------------
do $$
begin
    begin
        alter publication supabase_realtime add table public.messages;
    exception when duplicate_object then null;
    end;
    begin
        alter publication supabase_realtime add table public.items;
    exception when duplicate_object then null;
    end;
end
$$;


-- --------------------------------------------------------------------------
-- Done. No sample rows are inserted: the marketplace starts empty and fills
-- up with real listings. Verify with:
--
--   select tablename, policyname, cmd
--   from pg_policies
--   where schemaname = 'public'
--   order by tablename, policyname;
-- --------------------------------------------------------------------------
