DROP POLICY IF EXISTS "Public can view available products" ON public.products;
CREATE POLICY "Public can view all products"
ON public.products
FOR SELECT
TO anon
USING (true);