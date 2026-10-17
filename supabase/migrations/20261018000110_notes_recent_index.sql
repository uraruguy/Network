-- "Recently edited notes" (Today screen) reads the newest few notes by updated_at; without this
-- index every live note is scanned and sorted. Additive.
create index if not exists notes_owner_updated_idx on notes (owner_id, updated_at desc) where deleted_at is null;
