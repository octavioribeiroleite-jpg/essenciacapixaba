CREATE POLICY "Public can view available products"
ON public.products
FOR SELECT
TO anon
USING (current_ml > 0);

GRANT SELECT ON public.products TO anon;