-- Category names read as plurals ("Grinders", not "Grinder"). Slugs, and so
-- every web address, stay as they are. Uncountable ones (Storage, Rolling
-- Tobacco) and ones already plural are left alone. Safe to re-run.
update public.categories c
   set name = v.name
  from (values
    ('rolling-paper', 'Rolling Papers'),
    ('accessory', 'Accessories'),
    ('rolling-tray', 'Rolling Trays'),
    ('bong', 'Bongs'),
    ('bong-accessory', 'Bong Accessories'),
    ('ashtray', 'Ashtrays'),
    ('pipe', 'Pipes'),
    ('grinder', 'Grinders'),
    ('filter', 'Filters'),
    ('roach', 'Roaches'),
    ('lighter', 'Lighters'),
    ('cleaning-accessory', 'Cleaning Accessories'),
    ('blunt-pre-rolled-cone', 'Blunt Pre-Rolled Cones'),
    ('keychain', 'Keychains')
  ) as v(slug, name)
 where c.slug = v.slug and c.name <> v.name;
