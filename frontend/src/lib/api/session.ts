import type { LoginInput } from "@/types/auth";
import { request } from "./transport";

/**
 * "Am I signed in?" — the probe the app runs before it decides to draw the studio or the keypad.
 *
 * It hits `GET /auth/session`, added for this purpose. The old frontend asked a different
 * question instead (`GET /customers?limit=1`) and read "not a 401" as an answer. That worked, but
 * it spent a real customer query on a question about a cookie and coupled the login flow to an
 * unrelated endpoint's shape; a change to how customers are listed could log everyone out.
 *
 * A 401 here is the expected negative answer, not an error — the caller decides.
 */
export async function getSession(signal?: AbortSignal): Promise<void> {
  await request<void>({ url: "/auth/session", signal });
}

export async function login(input: LoginInput, signal?: AbortSignal) {
  await request<void>({
    url: "/auth/login",
    method: "POST",
    data: input,
    signal,
  });
}

export async function logout() {
  await request<void>({ url: "/auth/logout", method: "POST" });
}
