
-- Create enums
CREATE TYPE public.account_type AS ENUM ('savings', 'checking');
CREATE TYPE public.transaction_type AS ENUM ('deposit', 'withdrawal', 'transfer');
CREATE TYPE public.app_role AS ENUM ('customer', 'admin');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'customer',
  UNIQUE (user_id, role)
);

-- Create accounts table
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_number TEXT UNIQUE NOT NULL,
  balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  account_type account_type NOT NULL DEFAULT 'savings',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT positive_balance CHECK (balance >= 0)
);

-- Create transactions table
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_account_id UUID REFERENCES public.accounts(id),
  receiver_account_id UUID REFERENCES public.accounts(id),
  amount NUMERIC(15,2) NOT NULL,
  type transaction_type NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create audit_logs table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- User roles policies
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Accounts policies
CREATE POLICY "Users can view own accounts" ON public.accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all accounts" ON public.accounts FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Transactions policies
CREATE POLICY "Users can view own transactions" ON public.transactions FOR SELECT
  USING (
    sender_account_id IN (SELECT id FROM public.accounts WHERE user_id = auth.uid())
    OR receiver_account_id IN (SELECT id FROM public.accounts WHERE user_id = auth.uid())
  );
CREATE POLICY "Admins can view all transactions" ON public.transactions FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Audit logs policies
CREATE POLICY "Admins can view audit logs" ON public.audit_logs FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Function to generate account number
CREATE OR REPLACE FUNCTION public.generate_account_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  acc_num TEXT;
BEGIN
  acc_num := 'FC' || LPAD(FLOOR(RANDOM() * 100000000)::TEXT, 8, '0');
  WHILE EXISTS (SELECT 1 FROM public.accounts WHERE account_number = acc_num) LOOP
    acc_num := 'FC' || LPAD(FLOOR(RANDOM() * 100000000)::TEXT, 8, '0');
  END LOOP;
  RETURN acc_num;
END;
$$;

-- Trigger: auto-create profile and account on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer');
  
  INSERT INTO public.accounts (user_id, account_number, balance, account_type)
  VALUES (NEW.id, generate_account_number(), 0, 'savings');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Transfer funds RPC (ACID transaction)
CREATE OR REPLACE FUNCTION public.transfer_funds(
  p_sender_account_id UUID,
  p_receiver_account_number TEXT,
  p_amount NUMERIC
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_balance NUMERIC;
  v_receiver_account_id UUID;
  v_sender_user_id UUID;
  v_txn_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT user_id, balance INTO v_sender_user_id, v_sender_balance
  FROM public.accounts WHERE id = p_sender_account_id FOR UPDATE;
  
  IF v_sender_user_id IS NULL OR v_sender_user_id != auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF v_sender_balance < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient funds');
  END IF;

  SELECT id INTO v_receiver_account_id
  FROM public.accounts WHERE account_number = p_receiver_account_number FOR UPDATE;
  
  IF v_receiver_account_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Recipient account not found');
  END IF;

  IF v_receiver_account_id = p_sender_account_id THEN
    RETURN json_build_object('success', false, 'error', 'Cannot transfer to same account');
  END IF;

  UPDATE public.accounts SET balance = balance - p_amount WHERE id = p_sender_account_id;
  UPDATE public.accounts SET balance = balance + p_amount WHERE id = v_receiver_account_id;

  INSERT INTO public.transactions (sender_account_id, receiver_account_id, amount, type, status)
  VALUES (p_sender_account_id, v_receiver_account_id, p_amount, 'transfer', 'completed')
  RETURNING id INTO v_txn_id;

  INSERT INTO public.audit_logs (user_id, action, details)
  VALUES (auth.uid(), 'transfer', json_build_object('txn_id', v_txn_id, 'amount', p_amount, 'to', p_receiver_account_number));

  RETURN json_build_object('success', true, 'txn_id', v_txn_id);
END;
$$;

-- Deposit funds RPC
CREATE OR REPLACE FUNCTION public.deposit_funds(
  p_account_id UUID,
  p_amount NUMERIC
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_txn_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT user_id INTO v_user_id FROM public.accounts WHERE id = p_account_id;
  IF v_user_id IS NULL OR v_user_id != auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  UPDATE public.accounts SET balance = balance + p_amount WHERE id = p_account_id;

  INSERT INTO public.transactions (receiver_account_id, amount, type, status)
  VALUES (p_account_id, p_amount, 'deposit', 'completed')
  RETURNING id INTO v_txn_id;

  INSERT INTO public.audit_logs (user_id, action, details)
  VALUES (auth.uid(), 'deposit', json_build_object('txn_id', v_txn_id, 'amount', p_amount));

  RETURN json_build_object('success', true, 'txn_id', v_txn_id);
END;
$$;

-- Withdraw funds RPC
CREATE OR REPLACE FUNCTION public.withdraw_funds(
  p_account_id UUID,
  p_amount NUMERIC
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_balance NUMERIC;
  v_txn_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT user_id, balance INTO v_user_id, v_balance FROM public.accounts WHERE id = p_account_id FOR UPDATE;
  IF v_user_id IS NULL OR v_user_id != auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF v_balance < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient funds');
  END IF;

  UPDATE public.accounts SET balance = balance - p_amount WHERE id = p_account_id;

  INSERT INTO public.transactions (sender_account_id, amount, type, status)
  VALUES (p_account_id, p_amount, 'withdrawal', 'completed')
  RETURNING id INTO v_txn_id;

  INSERT INTO public.audit_logs (user_id, action, details)
  VALUES (auth.uid(), 'withdrawal', json_build_object('txn_id', v_txn_id, 'amount', p_amount));

  RETURN json_build_object('success', true, 'txn_id', v_txn_id);
END;
$$;

-- Updated at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
