ALTER TABLE public.categories ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.wallets ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.transactions ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.bills ALTER COLUMN user_id SET DEFAULT auth.uid();