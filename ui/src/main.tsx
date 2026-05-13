import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { rootRoute } from "./routes/root.tsx";
import "./index.css";

const router = createBrowserRouter([rootRoute]);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Mutations explicitly invalidate the queries they affect, so we don't
      // need aggressive background refetching. Window-focus refetch causes a
      // flicker on every alt-tab during dev which is more annoying than
      // useful for an internal admin tool.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
