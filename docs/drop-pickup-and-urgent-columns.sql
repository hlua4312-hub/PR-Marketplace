-- ==========================================================================
-- PR MARKETPLACE - DROP THE PICKUP SPOT AND URGENT COLUMNS
--
-- Both features are gone from the app as of 4.4.0:
--
--   pickup_spot  a campus landmark picked from a list - Main Gate, Library
--                entrance, hostel gates. A local marketplace has no such
--                shared landmarks, and where to meet is a thing two people
--                agree in chat rather than pick from a dropdown.
--   is_urgent    "I'm leaving campus soon", which pushed a listing up the
--                feed. It only meant anything against an academic calendar.
--
-- OPTIONAL, and IRREVERSIBLE. Nothing reads these columns any more, so
-- leaving them costs nothing but a little clutter in the table. Dropping
-- them destroys whatever was stored there, and Supabase has no undo.
--
-- If you want the values first:
--   select id, title, pickup_spot, is_urgent
--     from public.items
--    where pickup_spot is not null or is_urgent = true;
--
-- The schema file no longer creates these columns, so a fresh project will
-- not have them either way.
-- ==========================================================================

alter table public.items drop column if exists pickup_spot;
alter table public.items drop column if exists is_urgent;

-- Confirm. Neither name should appear.
select column_name
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'items'
 order by ordinal_position;
