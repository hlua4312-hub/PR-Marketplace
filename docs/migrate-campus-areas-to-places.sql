-- ==========================================================================
-- PR MARKETPLACE - MOVE THE TWO CAMPUS-ZONE LISTINGS ONTO REAL PLACES
--
-- The area filter briefly offered five campus zones (Campus, Boys Hostel,
-- Girls Hostel, Staff Quarters, Off campus) instead of the local areas the
-- app had used before. Two problems came out of that:
--
--   * Listings filed under real places - MZU Campus, Chanmari, Durtlang and
--     the rest - matched no option in the dropdown, so they could not be
--     found by area at all. Fifteen of seventeen listings were affected.
--   * "Use my location" set the filter to the nearest real area, which the
--     dropdown had no option for, so the control silently went blank.
--
-- The area list is now the local places again, and the GPS match reads that
-- same list. This script only has to move the two rows posted while the
-- campus zones were on offer.
--
-- Run once, in the Supabase SQL editor, after deploying 4.3.0.
-- Safe to run twice - the second run matches nothing.
-- ==========================================================================

-- See what is about to change:
--   select location, count(*) from public.items group by location order by 2 desc;

begin;

-- Unambiguous: the campus is MZU Campus, which is already in the list.
update public.items
   set location = 'MZU Campus'
 where location = 'Campus';

-- "Off campus" said where the item was NOT, which is not a place. Aizawl City
-- is the general catch-all in the list. If you know the real area for that
-- listing, open it in the app and set it properly - this is a default, not a
-- fact recovered from the data.
update public.items
   set location = 'Aizawl City'
 where location = 'Off campus';

commit;

-- Every location should now appear in the app's dropdown. This lists anything
-- that still does not - it should return no rows.
select location, count(*) as listings
  from public.items
 where location not in (
        'Aizawl City','MZU Campus','Zarkawt','Chanmari','Khatla','Bawngkawn',
        'Vaivakawn','Luangmual','Durtlang','Dinthar','Chite','Temple Veng',
        'Kulikawn','Lunglei')
 group by location
 order by 2 desc;
