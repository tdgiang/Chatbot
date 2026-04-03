import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return {};
  return { Authorization: `Bearer ${session.accessToken}` };
}

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function serverFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...headers,
      ...options?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}
