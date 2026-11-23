import { hc } from "hono/client";
import type { ApiType } from "backend";

const BACKEND_URL = import.meta.env.BACKEND_URL ?? "http://localhost:3000"

export const api = hc<ApiType>(BACKEND_URL);
