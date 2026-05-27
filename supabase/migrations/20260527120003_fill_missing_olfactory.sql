UPDATE public.products SET olfactory_family = CASE name
  WHEN 'Khamrah Qahwa' THEN 'oriental gourmand'
  WHEN 'Asad tradicional' THEN 'amadeirado aromático'
  WHEN 'Queen of Arabia' THEN 'oriental sofisticado'
  WHEN 'Infinity Gold' THEN 'floral frutado'
  WHEN 'Durrat Love' THEN 'floral frutado'
  WHEN 'Sabah Al Ward' THEN 'floral frutado'
  WHEN 'Yara Rosa' THEN 'floral adocicado'
  WHEN 'Ameerati' THEN 'floral oriental'
END
WHERE name IN ('Khamrah Qahwa','Asad tradicional','Queen of Arabia','Infinity Gold','Durrat Love','Sabah Al Ward','Yara Rosa','Ameerati')
  AND olfactory_family IS NULL;
