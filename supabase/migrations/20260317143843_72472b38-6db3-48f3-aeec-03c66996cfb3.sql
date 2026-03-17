
-- Enable pgcrypto for PIN hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add PIN hash and active status to profiles
ALTER TABLE public.profiles ADD COLUMN pin_hash TEXT;
ALTER TABLE public.profiles ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  from_user_id UUID,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  amount NUMERIC,
  is_read BOOLEAN NOT NULL DEFAULT false,
  related_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Function to set user PIN (hashed with bcrypt)
CREATE OR REPLACE FUNCTION public.set_user_pin(p_pin TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF length(p_pin) != 4 OR p_pin !~ '^\d{4}$' THEN
    RETURN json_build_object('success', false, 'error', 'PIN must be exactly 4 digits');
  END IF;
  
  UPDATE public.profiles 
  SET pin_hash = crypt(p_pin, gen_salt('bf'))
  WHERE id = auth.uid();
  
  RETURN json_build_object('success', true);
END;
$$;

-- Function to verify PIN
CREATE OR REPLACE FUNCTION public.verify_pin(p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pin_hash TEXT;
BEGIN
  SELECT pin_hash INTO v_pin_hash FROM public.profiles WHERE id = auth.uid();
  IF v_pin_hash IS NULL THEN RETURN false; END IF;
  RETURN v_pin_hash = crypt(p_pin, v_pin_hash);
END;
$$;

-- Function to check if user has PIN set
CREATE OR REPLACE FUNCTION public.has_pin_set()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND pin_hash IS NOT NULL);
END;
$$;

-- Get people list (security definer to bypass RLS, only safe columns)
CREATE OR REPLACE FUNCTION public.get_people_list(p_search TEXT DEFAULT '')
RETURNS TABLE(user_id UUID, full_name TEXT, email TEXT, is_active BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.full_name, p.email, p.is_active
  FROM public.profiles p
  WHERE p.id != auth.uid()
  AND (
    p_search = '' 
    OR p.full_name ILIKE '%' || p_search || '%' 
    OR p.email ILIKE '%' || p_search || '%'
  )
  ORDER BY p.full_name ASC
  LIMIT 50;
END;
$$;

-- Request funds from another user (creates notification)
CREATE OR REPLACE FUNCTION public.request_funds(p_from_user_id UUID, p_amount NUMERIC)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_requester_name TEXT;
BEGIN
  IF p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT full_name INTO v_requester_name FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.notifications (user_id, from_user_id, type, title, message, amount)
  VALUES (
    p_from_user_id, 
    auth.uid(), 
    'money_request', 
    'Money Request',
    COALESCE(v_requester_name, 'Someone') || ' requested $' || p_amount,
    p_amount
  );

  RETURN json_build_object('success', true);
END;
$$;

-- Send money to user by user_id (P2P) with PIN
CREATE OR REPLACE FUNCTION public.send_to_user(p_receiver_user_id UUID, p_amount NUMERIC, p_pin TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sender_account_id UUID;
  v_receiver_account_number TEXT;
BEGIN
  SELECT account_number INTO v_receiver_account_number
  FROM public.accounts WHERE user_id = p_receiver_user_id LIMIT 1;
  
  IF v_receiver_account_number IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Recipient not found');
  END IF;

  SELECT id INTO v_sender_account_id
  FROM public.accounts WHERE user_id = auth.uid() LIMIT 1;

  RETURN transfer_funds(v_sender_account_id, v_receiver_account_number, p_amount, p_pin);
END;
$$;

-- Update withdraw_funds to require PIN
CREATE OR REPLACE FUNCTION public.withdraw_funds(p_account_id UUID, p_amount NUMERIC, p_pin TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_balance NUMERIC;
  v_txn_id UUID;
  v_hash TEXT;
BEGIN
  IF p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  IF NOT verify_pin(COALESCE(p_pin, '')) THEN
    RETURN json_build_object('success', false, 'error', 'Invalid PIN');
  END IF;

  SELECT user_id, balance INTO v_user_id, v_balance FROM public.accounts WHERE id = p_account_id FOR UPDATE;
  IF v_user_id IS NULL OR v_user_id != auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF v_balance < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient funds');
  END IF;

  v_hash := generate_txn_hash();
  UPDATE public.accounts SET balance = balance - p_amount WHERE id = p_account_id;

  INSERT INTO public.transactions (sender_account_id, amount, type, status, is_successful, txn_hash)
  VALUES (p_account_id, p_amount, 'withdrawal', 'completed', true, v_hash)
  RETURNING id INTO v_txn_id;

  INSERT INTO public.audit_logs (user_id, action, details)
  VALUES (auth.uid(), 'withdrawal', json_build_object('txn_id', v_txn_id, 'amount', p_amount, 'txn_hash', v_hash));

  RETURN json_build_object('success', true, 'txn_id', v_txn_id, 'txn_hash', v_hash);
END;
$$;

-- Update transfer_funds to require PIN and notify receiver
CREATE OR REPLACE FUNCTION public.transfer_funds(p_sender_account_id UUID, p_receiver_account_number TEXT, p_amount NUMERIC, p_pin TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sender_balance NUMERIC;
  v_receiver_account_id UUID;
  v_sender_user_id UUID;
  v_receiver_user_id UUID;
  v_sender_name TEXT;
  v_txn_id UUID;
  v_hash TEXT;
BEGIN
  IF p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  IF NOT verify_pin(COALESCE(p_pin, '')) THEN
    RETURN json_build_object('success', false, 'error', 'Invalid PIN');
  END IF;

  SELECT user_id, balance INTO v_sender_user_id, v_sender_balance
  FROM public.accounts WHERE id = p_sender_account_id FOR UPDATE;
  
  IF v_sender_user_id IS NULL OR v_sender_user_id != auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF v_sender_balance < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient funds');
  END IF;

  SELECT id, user_id INTO v_receiver_account_id, v_receiver_user_id
  FROM public.accounts WHERE account_number = p_receiver_account_number FOR UPDATE;
  
  IF v_receiver_account_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Recipient account not found');
  END IF;

  IF v_receiver_account_id = p_sender_account_id THEN
    RETURN json_build_object('success', false, 'error', 'Cannot transfer to same account');
  END IF;

  v_hash := generate_txn_hash();

  UPDATE public.accounts SET balance = balance - p_amount WHERE id = p_sender_account_id;
  UPDATE public.accounts SET balance = balance + p_amount WHERE id = v_receiver_account_id;

  INSERT INTO public.transactions (sender_account_id, receiver_account_id, amount, type, status, is_successful, txn_hash)
  VALUES (p_sender_account_id, v_receiver_account_id, p_amount, 'transfer', 'completed', true, v_hash)
  RETURNING id INTO v_txn_id;

  INSERT INTO public.audit_logs (user_id, action, details)
  VALUES (auth.uid(), 'transfer', json_build_object('txn_id', v_txn_id, 'amount', p_amount, 'to', p_receiver_account_number, 'txn_hash', v_hash));

  -- Notify receiver
  SELECT full_name INTO v_sender_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.notifications (user_id, from_user_id, type, title, message, amount)
  VALUES (v_receiver_user_id, auth.uid(), 'money_received', 'Money Received',
    COALESCE(v_sender_name, 'Someone') || ' sent you $' || p_amount, p_amount);

  RETURN json_build_object('success', true, 'txn_id', v_txn_id, 'txn_hash', v_hash);
END;
$$;
