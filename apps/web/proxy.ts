import { type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/middleware";

// Next 16 renamed the `middleware` file convention to `proxy`; the behaviour
// is unchanged — refresh the Supabase auth session before the route renders.
export async function proxy(request: NextRequest) {
  return createClient(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|models|.*\\.(?:svg|png|jpg|jpeg|gif|webp|glb)$).*)",
  ],
};
