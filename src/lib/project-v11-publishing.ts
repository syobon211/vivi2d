let publishing = false;
export const isProjectV11Publishing = (): boolean => publishing;
export function publishProjectV11<T>(action: () => T): T {
  if (publishing) throw new Error("PROJECT_TRANSACTION_BUSY");
  publishing = true;
  try { return action(); } finally { publishing = false; }
}
