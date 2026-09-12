import { request } from "./transport";
import { listCustomers } from "./customers";
import type { LoginInput } from "@/types/auth";

export async function login(input: LoginInput) {
  await request<void>({ url: "/auth/login", method: "POST", data: input });
}

export async function logout() {
  await request<void>({ url: "/auth/logout", method: "POST" });
}

export async function checkSession() {
  return listCustomers({ limit: 1 });
}
