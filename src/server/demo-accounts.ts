export const DEMO_GROUP_NAME = "PIXEL CLAW CLUB";

export const DEMO_USERS = [
  { id: "11111111-1111-4111-8111-111111111111", nickname: "멤버 A", role: "OWNER" as const },
  { id: "22222222-2222-4222-8222-222222222222", nickname: "멤버 B", role: "MEMBER" as const },
  { id: "33333333-3333-4333-8333-333333333333", nickname: "멤버 C", role: "MEMBER" as const },
];

export const DEMO_COOKIE = "pcc_demo_user";

export function isDemoUserId(value: string): boolean {
  return DEMO_USERS.some((user) => user.id === value);
}
