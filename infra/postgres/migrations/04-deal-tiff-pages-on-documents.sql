-- Add deal TIFF page mapping per segmented document (deal bundle flow).
ALTER TABLE lc_v3.documents ADD COLUMN IF NOT EXISTS deal_tiff_pages JSONB;
