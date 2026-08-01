-- Flat price book: drop length bands and VL-specific families.
--
-- Bands under-reported nothing for Anthropic/OpenAI/DeepSeek (they never had any).
-- For Qwen they priced long prompts correctly, but the console and the book stay
-- simpler as one rate per family — under-report on rare >256K calls is accepted
-- for that simplicity. The band table remains; it is simply empty.
--
-- VL families duplicated flash/plus for the same vendor tier. Vision and text share
-- a slot layer at config time, so one family per level is enough: VL model ids
-- resolve onto the same row via match_patterns.

DELETE FROM helix_infra.model_price_band;

DELETE FROM helix_infra.model_price
 WHERE family IN ('qwen-vl-flash', 'qwen-vl-plus');

UPDATE helix_infra.model_price
   SET match_patterns = ARRAY[
           'qwen3.7-flash', 'qwen3.6-flash', 'qwen3.5-flash', 'qwen-flash',
           'qwen3.7-vl-flash', 'qwen3.6-vl-flash', 'qwen-vl-flash', 'vl-flash'
       ],
       note = 'Text and vision flash ids share this family. Flat rate; length bands not tracked.'
 WHERE family = 'qwen-flash';

UPDATE helix_infra.model_price
   SET match_patterns = ARRAY[
           'qwen3.7-plus', 'qwen3.6-plus', 'qwen3.5-plus', 'qwen-plus',
           'qwen-vl-plus'
       ],
       note = 'Text and vision plus ids share this family. Flat rate; length bands not tracked.'
 WHERE family = 'qwen-plus';
