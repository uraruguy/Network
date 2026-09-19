-- Hobbies, closeness circle, introduced-by graph edge
create type "public"."circle" as enum ('nice_to_know', 'hang_out_more', 'potential_close');

alter table people
  add column circle "public"."circle",
  add column hobbies text[] not null default '{}'::text[],
  add column hobbies_other text;

alter table people
  add constraint people_introduced_by_id_people_id_fk
  foreign key (introduced_by_id) references people(id) on delete set null;

create index if not exists people_introduced_by_idx on people (introduced_by_id);
create index if not exists people_hobbies_gin_idx on people using gin (hobbies);
