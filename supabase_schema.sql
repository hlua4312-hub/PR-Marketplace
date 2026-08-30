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
-- 0c. CAMPUS SETTINGS
--
--    Which college this deployment belongs to, and which email domains count
--    as proof of being a student there.
--
--    This lives in the database rather than in js/config.js on purpose. A
--    domain check written in the browser is decoration: anyone holding the
--    anon key can call the API directly and skip it. The trigger below reads
--    this table, so the rule is applied where it cannot be edited out.
--
--    >>> SET YOUR COLLEGE DOMAIN HERE <<<
--    Leave email_domains empty and every account is verified on sign-up,
--    which is what you want while testing. Add a domain and only addresses
--    ending in it can post:
--
--        update public.campus_settings
--        set campus_name = 'Mizoram University',
--            email_domains = array['mzu.edu.in']
--        where id;
-- --------------------------------------------------------------------------
create table if not exists public.campus_settings (
    id            boolean primary key default true check (id),
    campus_name   text   not null default 'Campus Cart',
    email_domains text[] not null default '{}',
    updated_at    timestamptz not null default now()
);

insert into public.campus_settings (id) values (true) on conflict (id) do nothing;

alter table public.campus_settings enable row level security;

drop policy if exists "campus settings are public" on public.campus_settings;

-- Readable by anyone so the sign-up form can say which address to use.
-- There is deliberately no insert/update/delete policy: with RLS on, that
-- denies all three. Change it from the SQL editor.
create policy "campus settings are public"
    on public.campus_settings for select
    using (true);

-- Does this address belong to the campus?
-- Fails open - if the settings row is missing, or no domain has been set,
-- everyone is a student. A half-configured deployment should be usable, not
-- a wall nobody can get past.
create or replace function public.email_is_campus(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce((
        select cardinality(s.email_domains) = 0
            or lower(split_part(p_email, '@', 2)) = any (
                   array(select lower(d) from unnest(s.email_domains) d)
               )
        from public.campus_settings s
        where s.id
    ), true);
$$;

revoke all on function public.email_is_campus(text) from public;
grant execute on function public.email_is_campus(text) to anon, authenticated;


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

-- Campus Cart additions. Separate statements so an existing project picks
-- them up without losing its rows.
alter table public.profiles add column if not exists avatar_url     text;
alter table public.profiles add column if not exists department     text;
alter table public.profiles add column if not exists year_of_study  text;
alter table public.profiles add column if not exists bio            text;
alter table public.profiles add column if not exists is_verified    boolean not null default false;
alter table public.profiles add column if not exists verified_at    timestamptz;

alter table public.profiles drop constraint if exists profiles_bio_length;
alter table public.profiles add  constraint profiles_bio_length
    check (bio is null or char_length(bio) <= 300);

alter table public.profiles enable row level security;

drop policy if exists "profiles: owner reads own row"     on public.profiles;
drop policy if exists "profiles: owner updates own row"   on public.profiles;
drop policy if exists "profiles: public display names"    on public.profiles;
drop policy if exists "profiles: cards are public"        on public.profiles;

-- Anyone may read a profile card. A seller's name, photo, course and verified
-- badge are part of deciding whether to meet a stranger behind the library,
-- so they are public the same way the listing is.
--
-- The phone number is not part of that card. It is kept out by column
-- privileges rather than by a policy, because RLS works on rows and this is a
-- column-shaped rule: the grant below lists every column the API may read,
-- and phone is not one of them. The app never needs it from here - it reads
-- the signed-in user's own number from their session, and the two functions
-- in section 2 resolve a phone to an email without exposing the table.
create policy "profiles: cards are public"
    on public.profiles for select
    using (true);

revoke select on public.profiles from anon, authenticated;
grant  select (id, full_name, avatar_url, department, year_of_study, bio,
               is_verified, verified_at, created_at)
    on public.profiles to anon, authenticated;

-- A signed-in user may correct their own details.
create policy "profiles: owner updates own row"
    on public.profiles for update
    using (auth.uid() = id)
    with check (auth.uid() = id);

-- ...but not their own verification. Without this, the update policy above
-- would let any account mark itself a verified student in one request.
create or replace function public.profiles_freeze_verification()
returns trigger
language plpgsql
as $$
begin
    if auth.uid() = old.id
       and (new.is_verified is distinct from old.is_verified
            or new.verified_at is distinct from old.verified_at) then
        raise exception 'Verification is set by the system, not by the account holder.';
    end if;
    return new;
end;
$$;

drop trigger if exists profiles_freeze_verification on public.profiles;
create trigger profiles_freeze_verification
    before update on public.profiles
    for each row execute function public.profiles_freeze_verification();

-- Rows are created by the trigger below, never by the client.

-- Copy the sign-up metadata into a profile row the moment the account exists,
-- and decide there and then whether the address is a campus one.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    student boolean := public.email_is_campus(new.email);
begin
    insert into public.profiles (id, full_name, phone, is_verified, verified_at)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
        nullif(new.raw_user_meta_data ->> 'phone', ''),
        student,
        case when student then now() end
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- Everyone who registered before verification existed gets judged by the same
-- rule, so an upgrade does not silently lock the current users out of posting.
update public.profiles p
   set is_verified = true,
       verified_at = coalesce(p.verified_at, now())
  from auth.users u
 where u.id = p.id
   and p.is_verified = false
   and public.email_is_campus(u.email);

-- Is this account allowed to post? Used by the items policy, which cannot
-- read profiles directly - RLS on one table does not see through to another
-- without a definer function.
create or replace function public.is_verified_student(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce((select is_verified from public.profiles where id = p_user), false);
$$;

revoke all on function public.is_verified_student(uuid) from public;
grant execute on function public.is_verified_student(uuid) to anon, authenticated;


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
    seller_upi_vpa   text,
    is_sold          boolean not null default false,
    sold_at          timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    constraint sold_at_matches_is_sold check (
        (is_sold = false and sold_at is null) or
        (is_sold = true  and sold_at is not null)
    )
);

-- Added after the table existed for some projects, so do it separately too.
alter table public.items add column if not exists seller_upi_vpa text;

-- Campus Cart additions.
--   listing_type   what the seller wants out of it. 'free' is its own mode
--                  rather than a price of zero, because a giveaway and a
--                  ₹0 sale read differently and get filtered differently.
--   barter_want    only meaningful when listing_type = 'barter'.
--   pickup_spot    a campus landmark, chosen from a list, not a street address.
--   image_urls     the whole gallery. image_url is kept as the first of these
--                  so anything reading the old column still works.
--   is_urgent      "leaving campus" - the end-of-semester clear-out.
alter table public.items add column if not exists listing_type text not null default 'sell';
alter table public.items add column if not exists barter_want  text;
alter table public.items add column if not exists pickup_spot  text;
alter table public.items add column if not exists image_urls   text[] not null default '{}';
alter table public.items add column if not exists is_urgent    boolean not null default false;

alter table public.items drop constraint if exists items_listing_type_valid;
alter table public.items add  constraint items_listing_type_valid
    check (listing_type in ('sell', 'free', 'barter'));

alter table public.items drop constraint if exists items_free_costs_nothing;
alter table public.items add  constraint items_free_costs_nothing
    check (listing_type <> 'free' or price = 0);

alter table public.items drop constraint if exists items_barter_want_length;
alter table public.items add  constraint items_barter_want_length
    check (barter_want is null or char_length(barter_want) <= 200);

alter table public.items drop constraint if exists items_gallery_size;
alter table public.items add  constraint items_gallery_size
    check (cardinality(image_urls) <= 6);

-- Backfill the gallery for listings posted before it existed.
update public.items
   set image_urls = array[image_url]
 where image_url is not null
   and cardinality(image_urls) = 0;

create index if not exists items_created_at_idx   on public.items (created_at desc);
create index if not exists items_category_idx     on public.items (category);
create index if not exists items_user_id_idx      on public.items (user_id);
create index if not exists items_listing_type_idx on public.items (listing_type);

alter table public.items enable row level security;

drop policy if exists "Allow public read access to items"        on public.items;
drop policy if exists "Allow public insert access to items"      on public.items;
drop policy if exists "Allow validated insert on items"          on public.items;
drop policy if exists "Allow public update access to items"      on public.items;
drop policy if exists "Allow update only to mark items as sold"  on public.items;
drop policy if exists "Allow public delete access to items"      on public.items;
drop policy if exists "items: anyone may browse"                 on public.items;
drop policy if exists "items: post as yourself"                  on public.items;
drop policy if exists "items: verified students post"            on public.items;
drop policy if exists "items: owner edits own listing"           on public.items;
drop policy if exists "items: owner deletes own listing"         on public.items;

-- Browsing the marketplace does not require an account.
create policy "items: anyone may browse"
    on public.items for select
    using (true);

-- You may only create a listing that belongs to you, and only once your
-- address has been recognised as a campus one. This is the whole of the
-- verification rule - the sign-up form's version of it is a courtesy that
-- explains the requirement early, not the thing that enforces it.
--
-- Reading and messaging are deliberately left open. Gating those as well
-- would mean nobody could ask a question until they were verified, and a
-- marketplace where the buyers are locked out is not safer, just empty.
create policy "items: verified students post"
    on public.items for insert
    to authenticated
    with check (
        auth.uid() = user_id
        and public.is_verified_student(auth.uid())
    );

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
-- 5b. REQUESTS - THE WANTED BOARD
--
--    The other half of a marketplace. A listing says "I have this"; a request
--    says "I need this", and someone holding it can answer.
--
--    There is deliberately no matching engine. Pairing requests to listings
--    automatically sounds obvious and behaves badly at campus scale: a few
--    hundred listings produce almost no matches, and an empty notification
--    feed reads as a broken feature. People browse the board instead.
-- --------------------------------------------------------------------------
create table if not exists public.requests (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references auth.users(id) on delete cascade,
    title          text not null check (char_length(title) between 3 and 120),
    description    text check (char_length(description) <= 1000),
    category       text not null,
    budget_max     numeric(12,2) check (budget_max is null or budget_max >= 0),
    needed_by      date,
    requester_name text not null,
    -- 'fulfilled' means someone came through; 'closed' means it stopped
    -- mattering. Both take it off the open board, and the difference is worth
    -- keeping because only one of them says the board worked.
    status         text not null default 'open'
                   check (status in ('open', 'fulfilled', 'closed')),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create index if not exists requests_status_idx   on public.requests (status, created_at desc);
create index if not exists requests_category_idx on public.requests (category);
create index if not exists requests_user_idx     on public.requests (user_id);

alter table public.requests enable row level security;

drop policy if exists "requests: anyone may read"        on public.requests;
drop policy if exists "requests: verified students post" on public.requests;
drop policy if exists "requests: owner edits own"        on public.requests;
drop policy if exists "requests: owner deletes own"      on public.requests;

create policy "requests: anyone may read"
    on public.requests for select
    using (true);

-- Same rule as listings: posting needs a verified account, reading does not.
create policy "requests: verified students post"
    on public.requests for insert
    to authenticated
    with check (
        auth.uid() = user_id
        and public.is_verified_student(auth.uid())
    );

create policy "requests: owner edits own"
    on public.requests for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "requests: owner deletes own"
    on public.requests for delete
    to authenticated
    using (auth.uid() = user_id);

drop trigger if exists requests_touch_updated_at on public.requests;
create trigger requests_touch_updated_at
    before update on public.requests
    for each row execute function public.touch_updated_at();


-- --------------------------------------------------------------------------
-- 5c. REVIEWS - THE TRUST LAYER
--
--    One review per person, per person. Not per deal: a running score with a
--    count under it is what a buyer actually reads, and letting the same pair
--    stack up five reviews turns that number into a measure of how often two
--    friends traded rather than how reliable anyone is. A review can be
--    rewritten instead, which is also the honest thing when someone makes good
--    on a bad first exchange.
-- --------------------------------------------------------------------------

-- You may review someone you have actually spoken to.
--
-- "Spoken to" is: both of you have posted in the same conversation, and it was
-- not the community room. That is deliberately weaker than "completed a deal"
-- - nothing here records a handshake behind the library - but it is real
-- evidence of contact, it cannot be faked without the other person taking
-- part, and it survives the listing being purged five hours after it sells.
--
-- It answers only about the caller. Taking two user ids would have made this
-- an oracle: the function reads messages with the definer's rights, user ids
-- are public on every listing, and anyone could then ask whether any two
-- people had ever spoken privately. Nothing needs that, and the policy below
-- only ever asks about auth.uid().
drop function if exists public.has_conversed(uuid, uuid);

create or replace function public.has_conversed(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.messages a
        join public.messages b
          on b.channel_type = a.channel_type
         and b.channel_id   = a.channel_id
        where a.channel_type <> 'community'
          and a.sender_id = auth.uid()
          and b.sender_id = p_other
    );
$$;

revoke all on function public.has_conversed(uuid) from public;
-- Signed out there is no caller to ask about, so anon is not granted.
grant execute on function public.has_conversed(uuid) to authenticated;

create table if not exists public.reviews (
    id          uuid primary key default gen_random_uuid(),
    subject_id  uuid not null references auth.users(id) on delete cascade,
    author_id   uuid not null references auth.users(id) on delete cascade,
    rating      smallint not null check (rating between 1 and 5),
    body        text check (char_length(body) <= 500),
    author_name text not null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),

    constraint reviews_not_yourself check (author_id <> subject_id),
    unique (author_id, subject_id)
);

create index if not exists reviews_subject_idx on public.reviews (subject_id, created_at desc);

alter table public.reviews enable row level security;

drop policy if exists "reviews: anyone may read"      on public.reviews;
drop policy if exists "reviews: rate someone you met" on public.reviews;
drop policy if exists "reviews: rewrite your own"     on public.reviews;
drop policy if exists "reviews: delete your own"      on public.reviews;

-- Public by design. A score nobody can see protects nobody.
create policy "reviews: anyone may read"
    on public.reviews for select
    using (true);

create policy "reviews: rate someone you met"
    on public.reviews for insert
    to authenticated
    with check (
        auth.uid() = author_id
        and auth.uid() <> subject_id
        and public.has_conversed(subject_id)
    );

-- You can rewrite what you said, but not who it is about or who wrote it.
create policy "reviews: rewrite your own"
    on public.reviews for update
    to authenticated
    using (auth.uid() = author_id)
    with check (auth.uid() = author_id);

create policy "reviews: delete your own"
    on public.reviews for delete
    to authenticated
    using (auth.uid() = author_id);

-- The subject and the author are fixed at insert. Without this the update
-- policy would let someone rewrite a 5-star review of a friend into a 1-star
-- review of a stranger, skipping the has_conversed() check entirely.
create or replace function public.reviews_freeze_parties()
returns trigger
language plpgsql
as $$
begin
    if new.subject_id is distinct from old.subject_id
    or new.author_id  is distinct from old.author_id
    or new.created_at is distinct from old.created_at then
        raise exception 'A review cannot change who it is about or who wrote it.';
    end if;
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists reviews_freeze_parties on public.reviews;
create trigger reviews_freeze_parties
    before update on public.reviews
    for each row execute function public.reviews_freeze_parties();

-- Keep the running score on the profile, so drawing a seller's card is one
-- request rather than one plus an aggregate.
alter table public.profiles add column if not exists rating_avg   numeric(3,2);
alter table public.profiles add column if not exists rating_count integer not null default 0;

create or replace function public.refresh_rating(p_subject uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.profiles p
       set rating_avg   = sub.avg_rating,
           rating_count = sub.n
      from (
        select round(avg(rating)::numeric, 2) as avg_rating, count(*)::int as n
        from public.reviews where subject_id = p_subject
      ) sub
     where p.id = p_subject;
end;
$$;

-- Only the trigger calls this. Left executable by everyone it would let any
-- caller write to profiles with the definer's rights; it recomputes from the
-- real reviews so it cannot forge a score, but nothing outside needs it.
revoke all on function public.refresh_rating(uuid) from public;

create or replace function public.reviews_sync_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    perform public.refresh_rating(coalesce(new.subject_id, old.subject_id));
    return null;
end;
$$;

drop trigger if exists reviews_sync_rating on public.reviews;
create trigger reviews_sync_rating
    after insert or update or delete on public.reviews
    for each row execute function public.reviews_sync_rating();

-- Bring existing rows into line, in case reviews arrived before this trigger.
update public.profiles p
   set rating_avg   = sub.avg_rating,
       rating_count = sub.n
  from (
    select subject_id, round(avg(rating)::numeric, 2) as avg_rating, count(*)::int as n
    from public.reviews group by subject_id
  ) sub
 where p.id = sub.subject_id;

-- The two new columns have to join the profile card's column grant, or the
-- API can read the name and photo but not the score beside them.
grant select (rating_avg, rating_count) on public.profiles to anon, authenticated;


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
-- 6b. PAYMENTS
--
-- The app takes no money and has no gateway. A buyer pays the seller directly
-- over UPI and then records the reference number here, so both sides have the
-- same record of what was claimed.
--
-- Read this row for what it is: the buyer's own statement that they paid.
-- Nothing here verifies a transaction - that would need a payment gateway.
-- The seller confirms against their own bank app, which is why the status
-- starts at 'submitted' and only the seller can move it.
-- --------------------------------------------------------------------------
create table if not exists public.payments (
    id          uuid primary key default gen_random_uuid(),

    -- Nullable on purpose: a sold listing is purged after 5 hours, and the
    -- payment record has to outlive it. The snapshot columns below carry
    -- enough to make sense of the row on its own.
    item_id     uuid references public.items(id) on delete set null,
    item_title  text not null,
    amount      numeric(12,2) not null check (amount >= 0),

    buyer_id    uuid not null references auth.users(id) on delete cascade,
    seller_id   uuid not null references auth.users(id) on delete cascade,

    utr         text not null check (char_length(trim(utr)) between 6 and 40),
    status      text not null default 'submitted'
                check (status in ('submitted', 'received', 'rejected')),
    seller_note text check (char_length(seller_note) <= 300),

    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),

    -- One UTR is one bank transaction, so the same buyer cannot file it twice.
    unique (buyer_id, utr)
);

create index if not exists payments_seller_idx on public.payments (seller_id, created_at desc);
create index if not exists payments_buyer_idx  on public.payments (buyer_id, created_at desc);

alter table public.payments enable row level security;

drop policy if exists "payments: both sides can read"   on public.payments;
drop policy if exists "payments: buyer files their own" on public.payments;
drop policy if exists "payments: seller settles"        on public.payments;

-- Only the two people involved.
create policy "payments: both sides can read"
    on public.payments for select
    to authenticated
    using (auth.uid() = buyer_id or auth.uid() = seller_id);

-- A buyer files their own payment, and the seller named on it has to be the
-- person who actually owns the listing.
create policy "payments: buyer files their own"
    on public.payments for insert
    to authenticated
    with check (
        auth.uid() = buyer_id
        and auth.uid() <> seller_id
        and exists (
            select 1 from public.items i
            where i.id = item_id and i.user_id = seller_id
        )
    );

-- Only the seller settles it, and only ever as themselves.
create policy "payments: seller settles"
    on public.payments for update
    to authenticated
    using (auth.uid() = seller_id)
    with check (auth.uid() = seller_id);

-- No delete policy: with RLS on, that denies it. A payment claim should not
-- be removable by either party.

-- The update policy lets the seller write the row, which on its own would let
-- them rewrite the amount or the UTR after the fact. Everything except the
-- status and their note is frozen.
create or replace function public.payments_freeze_claim()
returns trigger
language plpgsql
as $$
begin
    if new.item_id   is distinct from old.item_id
    or new.item_title is distinct from old.item_title
    or new.amount    is distinct from old.amount
    or new.buyer_id  is distinct from old.buyer_id
    or new.seller_id is distinct from old.seller_id
    or new.utr       is distinct from old.utr
    or new.created_at is distinct from old.created_at then
        raise exception 'Only status and seller_note can change on a payment.';
    end if;

    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists payments_freeze_claim on public.payments;
create trigger payments_freeze_claim
    before update on public.payments
    for each row execute function public.payments_freeze_claim();


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
    begin
        alter publication supabase_realtime add table public.payments;
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
