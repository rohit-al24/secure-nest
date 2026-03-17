
-- Add txn_hash column for secure transaction references
ALTER TABLE public.transactions ADD COLUMN txn_hash TEXT UNIQUE;

-- Add is_successful boolean column instead of text status for security
ALTER TABLE public.transactions ADD COLUMN is_successful BOOLEAN NOT NULL DEFAULT true;

-- Create function to generate transaction hash
CREATE OR REPLACE FUNCTION public.generate_txn_hash()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  v_hash := encode(gen_random_bytes(16), 'hex');
  WHILE EXISTS (SELECT 1 FROM public.transactions WHERE txn_hash = v_hash) LOOP
    v_hash := encode(gen_random_bytes(16), 'hex');
  END LOOP;
  RETURN v_hash;
END;
$$;

-- Update deposit_funds to include hash
CREATE OR REPLACE FUNCTION public.deposit_funds(p_account_id uuid, p_amount numeric)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_txn_id UUID;
  v_hash TEXT;
BEGIN
  IF p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT user_id INTO v_user_id FROM public.accounts WHERE id = p_account_id;
  IF v_user_id IS NULL OR v_user_id != auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  v_hash := generate_txn_hash();

  UPDATE public.accounts SET balance = balance + p_amount WHERE id = p_account_id;

  INSERT INTO public.transactions (receiver_account_id, amount, type, status, is_successful, txn_hash)
  VALUES (p_account_id, p_amount, 'deposit', 'completed', true, v_hash)
  RETURNING id INTO v_txn_id;

  INSERT INTO public.audit_logs (user_id, action, details)
  VALUES (auth.uid(), 'deposit', json_build_object('txn_id', v_txn_id, 'amount', p_amount, 'txn_hash', v_hash));

  RETURN json_build_object('success', true, 'txn_id', v_txn_id, 'txn_hash', v_hash);
END;
$$;

-- Update withdraw_funds to include hash
CREATE OR REPLACE FUNCTION public.withdraw_funds(p_account_id uuid, p_amount numeric)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Update transfer_funds to include hash
CREATE OR REPLACE FUNCTION public.transfer_funds(p_sender_account_id uuid, p_receiver_account_number text, p_amount numeric)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_balance NUMERIC;
  v_receiver_account_id UUID;
  v_sender_user_id UUID;
  v_txn_id UUID;
  v_hash TEXT;
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

  v_hash := generate_txn_hash();

  UPDATE public.accounts SET balance = balance - p_amount WHERE id = p_sender_account_id;
  UPDATE public.accounts SET balance = balance + p_amount WHERE id = v_receiver_account_id;

  INSERT INTO public.transactions (sender_account_id, receiver_account_id, amount, type, status, is_successful, txn_hash)
  VALUES (p_sender_account_id, v_receiver_account_id, p_amount, 'transfer', 'completed', true, v_hash)
  RETURNING id INTO v_txn_id;

  INSERT INTO public.audit_logs (user_id, action, details)
  VALUES (auth.uid(), 'transfer', json_build_object('txn_id', v_txn_id, 'amount', p_amount, 'to', p_receiver_account_number, 'txn_hash', v_hash));

  RETURN json_build_object('success', true, 'txn_id', v_txn_id, 'txn_hash', v_hash);
END;
$$;

-- Backfill existing transactions with hashes
UPDATE public.transactions SET txn_hash = encode(gen_random_bytes(16), 'hex') WHERE txn_hash IS NULL;
UPDATE public.transactions SET is_successful = (status = 'completed') WHERE true;
