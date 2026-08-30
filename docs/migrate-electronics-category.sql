-- ==========================================================================
-- PR MARKETPLACE - RENAME "Electronics" TO "Electronics & Computers"
--
-- The category was widened to cover laptops, processors and PC parts, which
-- had no obvious home before. Renaming the chip does not rename the data:
-- listings and requests posted under the old name keep it, and the new chip
-- will never match them, so they drop out of the category filter and become
-- reachable only by search.
--
-- Run once, in the Supabase SQL editor, after deploying the release that
-- carries the new list. Safe to run twice - the second run matches nothing.
--
-- Deliberately not part of supabase_schema.sql: that file describes the
-- shape of the database and is re-run freely, while this rewrites rows.
-- ==========================================================================

-- What is about to change. Run this first if you want to see it.
--   select category, count(*) from public.items    group by category order by 2 desc;
--   select category, count(*) from public.requests group by category order by 2 desc;

begin;

update public.items
   set category = 'Electronics & Computers'
 where category = 'Electronics';

update public.requests
   set category = 'Electronics & Computers'
 where category = 'Electronics';

commit;

-- Confirm nothing is left behind. Both should return no rows.
select 'items' as source, id, title, category
  from public.items
 where category = 'Electronics'
union all
select 'requests', id, title, category
  from public.requests
 where category = 'Electronics';
