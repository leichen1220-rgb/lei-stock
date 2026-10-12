import { createHandler } from '../_shared/publisher.mjs';
// Verify the user JWT with Auth; private reads use that same JWT and existing RLS.
Deno.serve(createHandler((name: string) => Deno.env.get(name)));
