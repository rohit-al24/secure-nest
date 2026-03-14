
-- Fix search_path on generate_account_number
CREATE OR REPLACE FUNCTION public.generate_account_number()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
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
