-- ==========================================================================
-- CAMPUS CART - MOVE EXISTING LISTINGS ONTO THE CAMPUS CATEGORIES
--
-- Optional, and deliberately not part of supabase_schema.sql.
--
-- The category list moved from a general local marketplace to a campus one:
-- "Fashion & Clothing" became "Clothing & Uniforms", "Real Estate" and
-- "Pets & Pet Supplies" went away, "Stationery" and "Lab & Project Kit"
-- arrived. Listings posted under the old names still exist and still show
-- their old label, but the new category chips will never match them, so they
-- are only reachable by search.
--
-- Run this once to bring them across. Read the mapping first: it is a
-- judgement about your listings, not a fact, and only you know whether the
-- three items filed under "Other" belong somewhere better.
--
-- If you have edited PRConfig.CAMPUS.categories in js/config.js, edit the
-- right-hand side here to match, or you will map rows onto a category the
-- app no longer shows.
-- ==========================================================================

-- What you have now, and how many of each. Run this on its own first.
select category, count(*) as listings
from public.items
group by category
order by listings desc;


-- The mapping. Anything not named here is left exactly as it is.
update public.items set category = case category
    when 'Books & Study Materials'  then 'Books & Notes'
    when 'Fashion & Clothing'       then 'Clothing & Uniforms'
    when 'Furniture'                then 'Room & Furniture'
    when 'Vehicles & Accessories'   then 'Cycles & Transport'
    when 'Toys & Games'             then 'Other'
    when 'Beauty & Personal Care'   then 'Other'
    when 'Pets & Pet Supplies'      then 'Other'
    when 'Real Estate'              then 'Other'
    -- 'Sports & Fitness', 'Musical Instruments' and 'Other' are unchanged.
    else category
  end
where category in (
    'Books & Study Materials', 'Fashion & Clothing', 'Furniture',
    'Vehicles & Accessories', 'Toys & Games', 'Beauty & Personal Care',
    'Pets & Pet Supplies', 'Real Estate'
);


-- Areas moved the same way: the header filter now offers campus places, so a
-- listing that says "Zarkawt" cannot be filtered to. There is no sensible
-- automatic mapping from a town district to a hostel, so this puts everything
-- into 'Off campus' and leaves you to correct the ones that are not.
--
-- Uncomment to run it.
--
-- update public.items
--    set location = 'Off campus'
--  where location not in (
--      'Campus', 'Boys Hostel', 'Girls Hostel', 'Staff Quarters', 'Off campus'
--  );


-- Check the result.
select category, location, count(*) as listings
from public.items
group by category, location
order by listings desc;
