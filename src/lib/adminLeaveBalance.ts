import { canRequestAnnualLeave, minutesToDays, remainingAnnualLeaveMinutes } from "@/lib/annualLeave";

type BalanceInput = {
  grantedMinutes: number;
  usedMinutes: number;
  approvedMinutes: number;
  pendingMinutes: number;
  workMinutesPerDay: number;
};

export function adminLeaveBalance(input: BalanceInput, requestedMinutes = 0) {
  const availableMinutes = remainingAnnualLeaveMinutes(input.grantedMinutes, input.usedMinutes, input.approvedMinutes, input.pendingMinutes);
  return {
    canRegister: canRequestAnnualLeave(availableMinutes, requestedMinutes, input.workMinutesPerDay),
    grantedDays: minutesToDays(input.grantedMinutes, input.workMinutesPerDay),
    usedDays: minutesToDays(input.usedMinutes + input.approvedMinutes + requestedMinutes, input.workMinutesPerDay),
    remainingDays: minutesToDays(availableMinutes - requestedMinutes, input.workMinutesPerDay),
  };
}
