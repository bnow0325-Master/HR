import { getCurrentWorkboardEmployee } from "@/lib/workboardSession";

/** 현재 요청이 인증된 관리자 세션인지 확인. */
export async function isAdmin(): Promise<boolean> {
  const employee = await getCurrentWorkboardEmployee("any");
  return employee?.systemRole === "ADMIN";
}
