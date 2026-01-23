-- Add front_raw column to store the original Anki text field for exact matching
ALTER TABLE public.raw_cards ADD COLUMN IF NOT EXISTS front_raw text;

-- Update existing rows to use front as front_raw (for backwards compatibility)
UPDATE public.raw_cards SET front_raw = front WHERE front_raw IS NULL;
