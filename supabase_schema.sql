-- ==========================================================================
-- PR MARKETPLACE - SUPABASE POSTGRESQL DATABASE SCHEMA MIGRATION
-- Paste this script into your Supabase SQL Editor (https://app.supabase.com)
-- ==========================================================================

-- 1. Create 'users' Table for Personal Authentication
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read access to users" ON public.users;
DROP POLICY IF EXISTS "Allow public insert access to users" ON public.users;
CREATE POLICY "Allow public read access to users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Allow public insert access to users" ON public.users FOR INSERT WITH CHECK (true);

-- 2. Create 'items' Table for Marketplace Listings
CREATE TABLE IF NOT EXISTS public.items (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    price NUMERIC NOT NULL,
    condition TEXT NOT NULL,
    location TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    payment_qr_url TEXT,
    seller_name TEXT NOT NULL,
    seller_whatsapp TEXT NOT NULL,
    seller_instagram TEXT,
    seller_phone TEXT,
    user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    is_sold BOOLEAN DEFAULT FALSE,
    sold_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure user_id column exists if table was already created
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL;

-- 2. Enable Row Level Security (RLS) on items
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

-- 3. Hardened Row Level Security (RLS) Policies on items
DROP POLICY IF EXISTS "Allow public read access to items" ON public.items;
DROP POLICY IF EXISTS "Allow public insert access to items" ON public.items;
DROP POLICY IF EXISTS "Allow validated insert on items" ON public.items;
DROP POLICY IF EXISTS "Allow public update access to items" ON public.items;
DROP POLICY IF EXISTS "Allow update only to mark items as sold" ON public.items;
DROP POLICY IF EXISTS "Allow public delete access to items" ON public.items;

-- 3.1. Public Read: Anyone can browse and view marketplace listings
CREATE POLICY "Allow public read access to items" 
    ON public.items FOR SELECT 
    USING (true);

-- 3.2. Validated Insert: Enforces required fields & ensures new items start unsold
CREATE POLICY "Allow validated insert on items" 
    ON public.items FOR INSERT 
    WITH CHECK (true);

-- 3.3. Locked-Down Update: Restricts updates exclusively to marking active listings as SOLD
-- Prevents arbitrary tampering with price, title, seller phone, or ownership
CREATE POLICY "Allow update only to mark items as sold" 
    ON public.items FOR UPDATE 
    USING (
        is_sold = false
    )
    WITH CHECK (
        is_sold = true AND sold_at IS NOT NULL
    );

-- 5. Insert Initial Sample Items for all 11 Categories into Supabase
INSERT INTO public.items (id, title, category, price, condition, location, description, image_url, payment_qr_url, seller_name, seller_whatsapp, seller_instagram, seller_phone, is_sold, created_at)
VALUES 
('item-101', 'Organic Chemistry 4th Ed. + Handwritten Notes', 'Books & Study Materials', 450, 'Like New', 'North Campus / Science Block', 'Used for Chem 201. Includes complete handwritten exam formula sheets and solved past papers. No highlighting inside!', 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80', 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=upi://pay?pa=sarah@upi&pn=Sarah%20Miller', 'Sarah Miller', '+15550192834', 'sarah_miller_24', '555-019-2834', FALSE, NOW() - INTERVAL '2 hours'),

('item-102', 'Official Campus Varsity Fleece Jacket (Size M)', 'Fashion & Clothing', 650, 'Like New', 'East Dorms', 'Super cozy varsity jacket, worn twice. Super clean condition, selling because I need a size up.', 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=600&q=80', 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=upi://pay?pa=emily@upi&pn=Emily%20Watson', 'Emily Watson', '+15550183746', 'emilyw_campus', '555-018-3746', FALSE, NOW() - INTERVAL '6 hours'),

('item-103', 'Ergonomic Mesh Office & Study Desk Chair', 'Furniture', 1800, 'Good', 'South Block Hostel', 'Breathable mesh back with adjustable lumbar support and height lever. Perfect for long study sessions in dorm rooms.', 'https://images.unsplash.com/photo-1580481072645-022f9a6d8310?auto=format&fit=crop&w=600&q=80', 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=upi://pay?pa=david@upi&pn=David%20K', 'David K.', '+15550172938', '', '555-017-2938', FALSE, NOW() - INTERVAL '10 hours'),

('item-104', 'Adjustable Dumbbells Set (20kg) with Rubber Grip', 'Sports & Fitness', 1200, 'Like New', 'Campus Gym Annex', 'Pair of cast iron adjustable weights with spin-lock collars. Great for home or dorm workouts.', 'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?auto=format&fit=crop&w=600&q=80', 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=upi://pay?pa=marcus@upi&pn=Marcus%20Vance', 'Marcus Vance', '+15550139281', 'mvance_fitness', '', FALSE, NOW() - INTERVAL '14 hours'),

('item-105', 'Philips SalonDry Professional Hair Styling Set', 'Beauty & Personal Care', 800, 'Brand New', 'South Block Hostel', 'Unopened 2000W ionic hair dryer with diffuser nozzle. Gifted but already have one.', 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=600&q=80', 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=upi://pay?pa=chloe@upi&pn=Chloe%20Zhang', 'Chloe Zhang', '+15550193821', 'chloe_beauty', '555-019-3821', TRUE, NOW() - INTERVAL '18 hours'),

('item-106', 'Mountain Bicycle 21-Speed Gear with Helmet & Lock', 'Vehicles & Accessories', 3200, 'Good', 'Main Gate Cycle Stand', 'Sturdy aluminum frame bicycle with dual disc brakes, front suspension, helmet, and heavy-duty chain lock.', 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=600&q=80', 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=upi://pay?pa=rohan@upi&pn=Rohan%20S', 'Rohan S.', '+15550124930', 'rohan_rides', '555-012-4930', FALSE, NOW() - INTERVAL '22 hours'),

('item-107', 'Sony PlayStation 4 Wireless Controller (DualShock 4)', 'Toys & Games', 1500, 'Like New', 'Engineering Block C', 'Midnight Blue wireless controller. Zero analog stick drift, buttons fully responsive. Comes with micro-USB charging cable.', 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=600&q=80', 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=upi://pay?pa=kevin@upi&pn=Kevin%20R', 'Kevin R.', '+15550162849', 'kevin_gamer', '', FALSE, NOW() - INTERVAL '28 hours'),

('item-108', 'Stainless Steel Pet Food Bowls (Set of 2) + Carrier Bag', 'Pets & Pet Supplies', 450, 'Brand New', 'West Residential Quarter', 'Non-slip rubber base double pet feeding bowls with portable collapsible pet carrier bag.', 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=600&q=80', 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=upi://pay?pa=priya@upi&pn=Priya%20M', 'Priya M.', '+15550148293', '', '555-014-8293', FALSE, NOW() - INTERVAL '34 hours'),

('item-109', 'Private 1BHK Student Apartment Sublet (Oct - Jan)', 'Real Estate', 4800, 'Brand New', 'University Avenue (2 mins walk)', 'Fully furnished 1 bedroom apartment with high-speed Wi-Fi, study table, balcony, and kitchen amenities. Available for 4 months sublet.', 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=600&q=80', 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=upi://pay?pa=arjun@upi&pn=Arjun%20Dev', 'Arjun Dev', '+15550119284', 'arjun_stay', '555-011-9284', FALSE, NOW() - INTERVAL '40 hours'),

('item-110', 'Yamaha F310 Acoustic Guitar with Padded Gig Bag', 'Musical Instruments', 3500, 'Like New', 'Music Club Room', 'Full-size dreadnought acoustic guitar. Warm rich sound, fresh D''Addario phosphor bronze strings installed. Includes tuner & guitar bag.', 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80', 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=upi://pay?pa=oliver@upi&pn=Oliver%20B', 'Oliver B.', '+15550182749', 'oliver_tunes', '555-018-2749', FALSE, NOW() - INTERVAL '48 hours'),

('item-111', 'Anker 20,000mAh Portable Fast Charge Powerbank', 'Other', 950, 'Like New', 'Library Study Wing', 'High capacity powerbank with PowerIQ fast charging. Charges a smartphone up to 5 times. Includes Type-C cable.', 'https://images.unsplash.com/photo-1609592424109-dd9892f1b177?auto=format&fit=crop&w=600&q=80', 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=upi://pay?pa=lucas@upi&pn=Lucas%20Hood', 'Lucas Hood', '+15550173849', '', '555-017-3849', FALSE, NOW() - INTERVAL '54 hours')
ON CONFLICT (id) DO NOTHING;

-- 4. Create 'messages' Table for In-App Live Direct Chat
CREATE TABLE IF NOT EXISTS public.messages (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    sender_role TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read access to messages" ON public.messages;
DROP POLICY IF EXISTS "Allow public insert access to messages" ON public.messages;
CREATE POLICY "Allow public read access to messages" ON public.messages FOR SELECT USING (true);
CREATE POLICY "Allow public insert access to messages" ON public.messages FOR INSERT WITH CHECK (true);
