import { connection } from "next/server";
import { checkDatabase } from "@/server/db";

/** Health check for the container HEALTHCHECK and uptime monitoring. No authentication. */
export async function GET() {
  await connection();
  const headers = { "Cache-Control": "no-store" };
  try {
    checkDatabase();
    return Response.json({ status: "ok" }, { headers });
  } catch (error) {
    console.error("Health check failed", error);
    return Response.json({ status: "error", database: "unavailable" }, { status: 503, headers });
  }
}
