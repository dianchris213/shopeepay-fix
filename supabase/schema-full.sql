CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'User',
  avatar TEXT NOT NULL DEFAULT 'U',
  currency TEXT NOT NULL DEFAULT 'IDR',
  push_notifications BOOLEAN NOT NULL DEFAULT true,
  biometric_lock BOOLEAN NOT NULL DEFAULT false,
  pin_set BOOLEAN NOT NULL DEFAULT false,
  reserve NUMERIC NOT NULL DEFAULT 0,
  language TEXT NOT NULL DEFAULT 'en',
  theme TEXT NOT NULL DEFAULT 'dark',
  reduce_motion BOOLEAN NOT NULL DEFAULT false,
  last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own profile" ON public.profiles FOR ALL TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Bank Account',
  balance NUMERIC NOT NULL DEFAULT 0,
  sub TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'wallet',
  color TEXT NOT NULL DEFAULT 'var(--chart-1)',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own wallets" ON public.wallets FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX wallets_user_idx ON public.wallets(user_id);

CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'expense',
  icon TEXT NOT NULL DEFAULT 'coins',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own categories" ON public.categories FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX categories_user_idx ON public.categories(user_id);

CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  wallet_name TEXT NOT NULL DEFAULT '',
  category_name TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'expense',
  amount NUMERIC NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'coins',
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own transactions" ON public.transactions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX transactions_user_date_idx ON public.transactions(user_id, date DESC);

CREATE TABLE public.bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  due_date DATE,
  icon TEXT NOT NULL DEFAULT 'bills',
  paid BOOLEAN NOT NULL DEFAULT false,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  priority_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bills TO authenticated;
GRANT ALL ON public.bills TO service_role;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bills" ON public.bills FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX bills_user_priority_idx ON public.bills(user_id, priority_order);

CREATE UNIQUE INDEX wallets_user_name_unique ON public.wallets (user_id, lower(btrim(name)));
CREATE UNIQUE INDEX categories_user_type_name_unique ON public.categories (user_id, type, lower(btrim(name)));
CREATE UNIQUE INDEX bills_user_name_unique ON public.bills (user_id, lower(btrim(name)));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, avatar)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1), 'User'),
    UPPER(LEFT(COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email, 'U'), 1))
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.categories (user_id, name, type, icon) VALUES
    (NEW.id, 'Salary', 'income', 'salary'),
    (NEW.id, 'Food', 'expense', 'food'),
    (NEW.id, 'Transport', 'expense', 'transport'),
    (NEW.id, 'Bills', 'expense', 'bills');

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.app_stats()
RETURNS TABLE (total_users BIGINT, total_transactions BIGINT, total_wallets BIGINT, total_bills BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM public.profiles),
    (SELECT count(*) FROM public.transactions),
    (SELECT count(*) FROM public.wallets),
    (SELECT count(*) FROM public.bills);
$$;
REVOKE ALL ON FUNCTION public.app_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.app_stats()
RETURNS TABLE (total_users BIGINT, total_transactions BIGINT, total_wallets BIGINT, total_bills BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM public.profiles),
    (SELECT count(*) FROM public.transactions),
    (SELECT count(*) FROM public.wallets),
    (SELECT count(*) FROM public.bills);
$$;
REVOKE ALL ON FUNCTION public.app_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_stats() TO authenticated;