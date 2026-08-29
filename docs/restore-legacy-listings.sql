-- ==========================================================================
-- OPTIONAL: bring your old listings back
--
-- supabase_schema.sql renames the old tables to *_legacy rather than deleting
-- them, so the rows are still there. It cannot re-import them automatically:
-- every listing needs an owner in auth.users, and the old user_id values are
-- text like 'user-1756512345678' that match nothing.
--
-- So this is a manual step, run once, after you have registered an account in
-- the app. It reassigns the old listings to that account.
--
-- HOW TO USE
--   1. Run supabase_schema.sql first.
--   2. Open the app and register (and confirm your email, if that is on).
--   3. Put your email on the line marked below.
--   4. Run this file in the SQL Editor.
--
-- Safe to run twice: it skips anything already imported.
-- ==========================================================================

do $$
declare
    -- >>> PUT YOUR REGISTERED EMAIL HERE <<<
    target_email  text := 'you@example.com';

    owner_id      uuid;
    imported      integer;
begin
    select id into owner_id from auth.users where lower(email) = lower(target_email);

    if owner_id is null then
        raise exception
          'No account found for %. Register in the app first, then run this again.',
          target_email;
    end if;

    if to_regclass('public.items_legacy') is null then
        raise notice 'No items_legacy table - nothing to import.';
        return;
    end if;

    with imported_rows as (
        insert into public.items (
            user_id, title, category, price, condition, location, description,
            image_url, payment_qr_url, seller_name, seller_phone,
            seller_whatsapp, seller_instagram, is_sold, sold_at, created_at
        )
        select
            owner_id,
            left(l.title, 120),
            coalesce(l.category, 'Other'),
            greatest(coalesce(l.price, 0), 0),

            -- The new table constrains condition to these four values.
            case
                when l.condition in ('Brand New', 'Like New', 'Good', 'Fair') then l.condition
                else 'Good'
            end,

            coalesce(nullif(trim(l.location), ''), 'Aizawl'),
            left(l.description, 2000),
            l.image_url,
            l.payment_qr_url,
            coalesce(nullif(trim(l.seller_name), ''), 'Seller'),
            l.seller_phone,
            l.seller_whatsapp,
            l.seller_instagram,
            coalesce(l.is_sold, false),

            -- sold_at and is_sold have to agree, or the check constraint rejects the row.
            case when coalesce(l.is_sold, false) then coalesce(l.sold_at, now()) else null end,

            coalesce(l.created_at, now())
        from public.items_legacy l
        where char_length(coalesce(trim(l.title), '')) >= 3
          -- Skip anything already brought across, so this can be re-run.
          and not exists (
              select 1 from public.items i
              where i.title = left(l.title, 120)
                and i.created_at = coalesce(l.created_at, now())
          )
        returning 1
    )
    select count(*) into imported from imported_rows;

    raise notice 'Imported % listing(s) and assigned them to %.', imported, target_email;
end
$$;


-- --------------------------------------------------------------------------
-- A note on the photos
--
-- Old listings stored their image as a base64 data URL inside the column,
-- which is what the rebuild moved away from. They will still display, because
-- the app just puts image_url in an <img src>. But they keep the old size
-- cost, and they will not benefit from the image cache.
--
-- If you would rather start clean on photos, run this after importing and
-- re-upload them through the app:
--
--   update public.items
--   set image_url = null
--   where image_url like 'data:image/%';
-- --------------------------------------------------------------------------


-- --------------------------------------------------------------------------
-- When you are finished with the old tables
--
-- users_legacy is the one holding plaintext passwords. Access to it is already
-- revoked, but dropping it is better.
--
--   drop table if exists public.users_legacy;
--   drop table if exists public.items_legacy;
--   drop table if exists public.messages_legacy;
-- --------------------------------------------------------------------------
