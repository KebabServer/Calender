-- Add optional task details without changing ownership policies or existing data.
alter table public.tasks
  add column if not exists description text not null default ''
    constraint tasks_description_length check (char_length(description) <= 5000),
  add column if not exists due_date date
    constraint tasks_due_date_range check (due_date between date '0001-01-01' and date '9999-12-31');
