-- ==========================================================================
-- PR MARKETPLACE - DEMO LISTINGS
--
-- Ten listings so the feed has enough in it to scroll properly for a demo.
-- Run in the Supabase SQL editor. Safe to run twice: it removes its own rows
-- first, so you end up with ten rather than twenty.
--
-- Seeded under an account that already exists. Nothing here creates a user:
-- auth.users belongs to Supabase Auth, and inserting into it by hand produces
-- an account that cannot sign in.
--
-- No image URLs. The app deliberately makes no third-party image request, and
-- pointing these at a stock photo site would undo that, so the cards show
-- their placeholder. Add photos through the app if you want them on screen.
--
-- Section 3 removes them again.
-- ==========================================================================


-- --------------------------------------------------------------------------
-- 1. WHO OWNS THEM
--
--    Defaults to whoever already has the most listings - a real, verified
--    account, without you having to look up a uuid. To seed under a specific
--    account instead, set v_email.
-- --------------------------------------------------------------------------
do $seed$
declare
    v_email text := null;          -- e.g. 'you@example.com', or leave null
    v_owner uuid;
    v_name  text;
begin
    if v_email is not null then
        select id into v_owner from auth.users where email = v_email;
        if v_owner is null then
            raise exception 'No account with email %', v_email;
        end if;
    else
        select user_id into v_owner
          from public.items
         group by user_id
         order by count(*) desc
         limit 1;

        if v_owner is null then
            select id into v_owner from auth.users order by created_at limit 1;
        end if;
    end if;

    if v_owner is null then
        raise exception 'No accounts exist yet. Register in the app first.';
    end if;

    select coalesce(full_name, 'Campus Seller') into v_name
      from public.profiles where id = v_owner;
    v_name := coalesce(v_name, 'Campus Seller');

    -- ----------------------------------------------------------------------
    -- 2. THE LISTINGS
    --
    --    Spread deliberately: all ten categories, all three listing types,
    --    all four conditions, two marked urgent, and prices from nothing to
    --    4,500 - so the category chips, the For sale / Free / Swap tabs, the
    --    condition badges and the price slider all have something to show.
    -- ----------------------------------------------------------------------
    delete from public.items
     where user_id = v_owner
       and title in (
        'Higher Engineering Mathematics by Kreyszig',
        'Casio fx-991EX scientific calculator',
        'Drafting set, never used',
        'Study table with drawer',
        'Lab coat, size M',
        'Hero Sprint cycle, 21 speed',
        'Badminton racket and three shuttles',
        'Arduino Uno starter kit',
        'Acoustic guitar, nylon string',
        'Desk lamp, works fine'
       );

    insert into public.items
        (user_id, title, category, price, condition, location, description,
         seller_name, listing_type, barter_want, pickup_spot, is_urgent, created_at)
    values
        (v_owner, 'Higher Engineering Mathematics by Kreyszig', 'Books & Notes',
         450, 'Good', 'MZU Campus',
         'Tenth edition. The cover is worn and a few pages had pencil notes, all rubbed out. Nothing missing.',
         v_name, 'sell', null, 'Library entrance', false, now() - interval '2 hours'),

        (v_owner, 'Casio fx-991EX scientific calculator', 'Electronics & Computers',
         900, 'Like New', 'Chanmari',
         'Bought for a semester of numerical methods and barely used since. Slip cover included.',
         v_name, 'sell', null, 'Academic Block', false, now() - interval '5 hours'),

        (v_owner, 'Drafting set, never used', 'Stationery',
         250, 'Brand New', 'MZU Campus',
         'Compass, dividers, set squares, the lot. Bought for a drawing paper that got dropped from the syllabus.',
         v_name, 'sell', null, 'Main Gate', false, now() - interval '9 hours'),

        (v_owner, 'Study table with drawer', 'Room & Furniture',
         1800, 'Good', 'Bawngkawn',
         'Solid wood, one drawer, fits a laptop and a stack of books. You will need a friend and an auto to move it.',
         v_name, 'sell', null, 'Boys Hostel gate', false, now() - interval '1 day'),

        (v_owner, 'Lab coat, size M', 'Clothing & Uniforms',
         300, 'Like New', 'MZU Campus',
         'Worn for one semester of practicals. Washed, no stains and no burns.',
         v_name, 'sell', null, 'Academic Block', false, now() - interval '1 day 4 hours'),

        (v_owner, 'Hero Sprint cycle, 21 speed', 'Cycles & Transport',
         4500, 'Fair', 'Zarkawt',
         'Gets me to class and back. The gears need indexing and the rear tyre is due for replacement, so it is priced for that.',
         v_name, 'sell', null, 'Sports ground', true, now() - interval '1 day 8 hours'),

        (v_owner, 'Badminton racket and three shuttles', 'Sports & Fitness',
         600, 'Good', 'Chanmari',
         'Yonex, restrung last month. Two feather shuttles and one nylon.',
         v_name, 'sell', null, 'Sports ground', false, now() - interval '2 days'),

        (v_owner, 'Arduino Uno starter kit', 'Lab & Project Kit',
         1200, 'Like New', 'MZU Campus',
         'Board, breadboard, jumper wires, LEDs, a servo and the little ultrasonic sensor. Enough for a first project.',
         v_name, 'sell', null, 'Academic Block', false, now() - interval '2 days 6 hours'),

        (v_owner, 'Acoustic guitar, nylon string', 'Musical Instruments',
         3200, 'Fair', 'Khatla',
         'A beginner guitar with an honest amount of wear. The tuning pegs hold fine. Happy to swap instead.',
         v_name, 'barter', 'A keyboard, or a decent pair of headphones', 'Canteen', false, now() - interval '3 days'),

        (v_owner, 'Desk lamp, works fine', 'Other',
         0, 'Good', 'MZU Campus',
         'Leaving campus and it will not fit in the bag. Free to whoever comes and gets it.',
         v_name, 'free', null, 'Girls Hostel gate', true, now() - interval '3 days 5 hours');

    raise notice 'Seeded 10 listings for % (%)', v_name, v_owner;
end;
$seed$;


-- --------------------------------------------------------------------------
-- 3. UNDO
--
--    Matched by title, so anything you or anyone else posted is left alone.
--    Uncomment and run on its own.
-- --------------------------------------------------------------------------
-- delete from public.items
--  where title in (
--     'Higher Engineering Mathematics by Kreyszig',
--     'Casio fx-991EX scientific calculator',
--     'Drafting set, never used',
--     'Study table with drawer',
--     'Lab coat, size M',
--     'Hero Sprint cycle, 21 speed',
--     'Badminton racket and three shuttles',
--     'Arduino Uno starter kit',
--     'Acoustic guitar, nylon string',
--     'Desk lamp, works fine'
--  );
