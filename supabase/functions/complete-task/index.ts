/**
 * Caller-scoped task completion entry point.
 *
 * All writes remain atomic inside public.complete_task. The caller JWT is
 * forwarded to PostgREST so auth.uid() in PostgreSQL is the authorization
 * source of truth; this function never completes tasks through service_role.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCompleteTaskRequest } from './handler.ts';
import type { CompleteTaskBody } from './handler.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authorization = req.headers.get('Authorization');
  if (!authorization) {
    const result = await handleCompleteTaskRequest(
      { method: req.method, authorization, body: undefined },
      async () => ({ data: null, error: null }),
    );
    return jsonResponse(result.body, result.status);
  }

  let body: CompleteTaskBody | undefined;
  try {
    body = await req.json() as CompleteTaskBody;
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400);
  }

  const result = await handleCompleteTaskRequest(
    { method: req.method, authorization, body },
    async (callerAuthorization, args) => {
      const callerClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        {
          global: {
            headers: { Authorization: callerAuthorization },
          },
        },
      );

      return callerClient.rpc('complete_task', args);
    },
  );

  return jsonResponse(result.body, result.status);
});
