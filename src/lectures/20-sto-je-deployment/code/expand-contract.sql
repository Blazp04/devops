-- ① Proširi (prije uvođenja 2.0.0): novi stupac uz stari
ALTER TABLE narudzbe ADD COLUMN cijena_s_pdv numeric(8, 2);

-- Dok rade obje verzije, okidač drži oba stupca usklađena:
-- 1.4.1 piše samo cijena, 2.0.0 piše samo cijena_s_pdv.
-- (stopa_pdv je postojeći stupac sa stopom za to jelo)
CREATE FUNCTION uskladi_cijene() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.cijena_s_pdv IS NULL THEN          -- narudžbu je upisala 1.4.1
      NEW.cijena_s_pdv := round(NEW.cijena * (1 + NEW.stopa_pdv), 2);
    ELSIF NEW.cijena IS NULL THEN             -- narudžbu je upisala 2.0.0
      NEW.cijena := round(NEW.cijena_s_pdv / (1 + NEW.stopa_pdv), 2);
    END IF;
  ELSIF NEW.cijena IS DISTINCT FROM OLD.cijena THEN     -- 1.4.1 mijenja cijenu
    NEW.cijena_s_pdv := round(NEW.cijena * (1 + NEW.stopa_pdv), 2);
  ELSIF NEW.cijena_s_pdv IS DISTINCT FROM OLD.cijena_s_pdv
        AND OLD.cijena_s_pdv IS NOT NULL THEN           -- 2.0.0 mijenja cijenu
    NEW.cijena := round(NEW.cijena_s_pdv / (1 + NEW.stopa_pdv), 2);
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER narudzbe_uskladi_cijene
  BEFORE INSERT OR UPDATE ON narudzbe
  FOR EACH ROW EXECUTE FUNCTION uskladi_cijene();

-- popunite stare narudžbe (na velikoj tablici u manjim serijama)
UPDATE narudzbe
SET cijena_s_pdv = round(cijena * (1 + stopa_pdv), 2)
WHERE cijena_s_pdv IS NULL;

-- ② Uvedite 2.0.0: čita i upisuje samo cijena_s_pdv; okidač i dalje
--    puni stari stupac cijena, pa je povratak na 1.4.1 siguran.

-- ③ Suzi: tek kad nijedan Pod ne čita ni ne upisuje cijena
--    i kad se više ne vraćate na 1.4.1
DROP TRIGGER narudzbe_uskladi_cijene ON narudzbe;
DROP FUNCTION uskladi_cijene();
ALTER TABLE narudzbe DROP COLUMN cijena;

-- Petkova migracija: preimenuj pa preračunaj, sve u jednom koraku usred
-- uvođenja. Svi Podovi 1.4.1 odmah padaju: stupca cijena više nema.
-- ALTER TABLE narudzbe RENAME COLUMN cijena TO cijena_s_pdv;
-- UPDATE narudzbe SET cijena_s_pdv = round(cijena_s_pdv * (1 + stopa_pdv), 2);
