import { NextResponse } from "next/server";
import { workboardSessionCookieName } from "@/lib/workboardSession";

export async function POST() {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set({ name: workboardSessionCookieName, value: "", path: "/", maxAge: 0 });
  return response;
}
