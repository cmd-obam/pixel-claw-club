import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  acceptInvitation,
  bootstrapGroup,
  createInvitation,
  emptyState,
  registerProfile,
  type ClubState,
} from "@/server/engine/club-engine";
import { DEMO_GROUP_NAME, DEMO_USERS } from "@/server/demo-accounts";

const directory = path.join(process.cwd(), ".demo-data");
const filePath = path.join(directory, "club.json");

export function createDemoSeed(): ClubState {
  const state = emptyState();
  const clock = () => new Date("2026-10-20T00:00:00.000Z");
  for (const user of DEMO_USERS) {
    registerProfile(state, user.id, user.nickname, clock);
  }
  const owner = DEMO_USERS[0];
  if (!owner) {
    throw new Error("demo owner missing");
  }
  bootstrapGroup(state, owner.id, DEMO_GROUP_NAME, clock);
  for (const user of DEMO_USERS.slice(1)) {
    const invitation = createInvitation(state, owner.id, clock);
    acceptInvitation(state, user.id, invitation.token, clock);
  }
  return state;
}

function readState(): ClubState {
  if (!existsSync(filePath)) {
    return createDemoSeed();
  }
  const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || !("groups" in parsed)) {
    throw new Error("demo state is unreadable");
  }
  return parsed as ClubState;
}

let queue: Promise<void> = Promise.resolve();

export async function withDemoState<T>(fn: (state: ClubState) => T): Promise<T> {
  const run = queue.then(() => {
    const state = readState();
    const result = fn(state);
    mkdirSync(directory, { recursive: true });
    writeFileSync(filePath, JSON.stringify(state));
    return result;
  });
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function resetDemoState(): Promise<void> {
  await withDemoState((state) => {
    const fresh = createDemoSeed();
    Object.assign(state, fresh);
  });
}
