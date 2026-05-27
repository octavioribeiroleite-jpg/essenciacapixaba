DROP VIEW IF EXISTS public.catalog_products;
CREATE VIEW public.catalog_products AS
SELECT id, name, brand, image_url, sale_price_per_ml, current_ml, total_ml,
       concentration, gender, longevity, sillage, description, fragrance_notes,
       occasions, olfactory_family
FROM public.products;
GRANT SELECT ON public.catalog_products TO anon, authenticated;