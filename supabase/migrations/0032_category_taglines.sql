-- A line of copy for each category, shown under its name at the top of the
-- shelf ("Grinders / Every way to break it down."). Editable in the admin
-- (Products, category tools). Drafts below; empty is fine, the shelf then
-- shows just the name. Safe to re-run: only fills lines still empty.
alter table public.categories add column if not exists tagline text;

update public.categories c
   set tagline = v.tagline
  from (values
    ('rolling-paper', 'Thin, slow and even. The way it should burn.'),
    ('accessory', 'The little things that make the ritual.'),
    ('rolling-tray', 'Every good session starts on a clean surface.'),
    ('storage', 'Keep it fresh. Keep it quiet.'),
    ('bong', 'Glass, water, patience.'),
    ('bong-accessory', 'Bowls, catchers and the bits that keep it running.'),
    ('ashtray', 'Somewhere nice to land.'),
    ('pipe', 'Pack it, light it, pass it.'),
    ('grinder', 'Every way to break it down.'),
    ('filter', 'Smoother, every single time.'),
    ('rolling-tobacco', 'Loose leaf, rolled your way.'),
    ('roach', 'Tips that hold it all together.'),
    ('cigars', 'Slow down. Light one.'),
    ('lighter', 'Fire, on your terms.'),
    ('blunt-wraps', 'Wrapped, sealed, done.'),
    ('cleaning-accessory', 'Clean glass hits different.'),
    ('blunt-pre-rolled-cone', 'Rolled for you. Just fill and go.'),
    ('keychain', 'Keys, but make it interesting.'),
    ('lighter-refills', 'Never run dry mid-light.')
  ) as v(slug, tagline)
 where c.slug = v.slug and coalesce(c.tagline, '') = '';

-- the first draft for Keychains, replaced if it was already applied
update public.categories
   set tagline = 'Keys, but make it interesting.'
 where slug = 'keychain' and tagline = 'Carry a little Baba with you.';
