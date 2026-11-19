import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { Suspense } from "react";

async function TodosList() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: todos } = await supabase.from("todos").select();

  return (
    <ul className="list-disc pl-5 space-y-1">
      {todos && todos.length > 0 ? (
        todos.map((todo: { id: string | number; name: string }) => (
          <li key={todo.id}>{todo.name}</li>
        ))
      ) : (
        <li className="text-muted-foreground">No todos found or table not yet populated.</li>
      )}
    </ul>
  );
}

export default function TodosPage() {
  return (
    <main className="p-8 max-w-xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Todos Example</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading todos...</p>}>
        <TodosList />
      </Suspense>
    </main>
  );
}
