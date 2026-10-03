-- Ključ idempotentnosti = broj narudžbe.
-- Tablica "skuhano" pamti koje su narudžbe već skuhane.
CREATE TABLE IF NOT EXISTS skuhano (
  narudzba_id bigint PRIMARY KEY,
  skuhano_u   timestamptz NOT NULL DEFAULT now()
);

BEGIN;

-- oznaka obrade i učinak (listić) u ISTOJ transakciji
WITH novo AS (
  INSERT INTO skuhano (narudzba_id) VALUES (42)
  ON CONFLICT (narudzba_id) DO NOTHING  -- 2. put: ništa
  RETURNING narudzba_id
)
INSERT INTO listici (narudzba_id, jelo, komada)
SELECT narudzba_id, 'ćevapi', 10 FROM novo;  -- prazno: nema listića

COMMIT;  -- pad prije ovoga: ništa nije upisano, posao se ponovi
