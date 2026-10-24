import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getDb } from "./client";
import {
  checkDatabase,
  countUsers,
  createWorkspaceWithOwner,
  findAccessContext,
  getWorkspaceOverview,
} from "./index";
import { memberships, users } from "./schema";

function insertUser(name: string) {
  const user = { id: randomUUID(), name, email: `${name.toLowerCase()}@example.com` };
  getDb().insert(users).values(user).run();
  return user;
}

describe("data-access layer", () => {
  it("applies the migrations and answers the health check", () => {
    expect(() => checkDatabase()).not.toThrow();
    expect(countUsers()).toBe(0);
  });

  it("creates a workspace owned by the user and resolves the access context", () => {
    const user = insertUser("Alice");
    const workspace = createWorkspaceWithOwner({ userId: user.id, workspaceName: "Garage A" });

    const context = findAccessContext(user);
    expect(context).toEqual({
      user,
      workspace: { id: workspace.id, name: "Garage A" },
      role: "owner",
    });
    expect(countUsers()).toBe(1);
  });

  it("returns no context for a user without a workspace", () => {
    expect(findAccessContext(insertUser("Nobody"))).toBeNull();
  });

  it("scopes workspace reads to members", () => {
    const alice = insertUser("Alicia");
    const bob = insertUser("Bob");
    const garageA = createWorkspaceWithOwner({ userId: alice.id, workspaceName: "Garage A" });
    createWorkspaceWithOwner({ userId: bob.id, workspaceName: "Garage B" });

    const aliceContext = findAccessContext(alice);
    expect(aliceContext).not.toBeNull();
    expect(getWorkspaceOverview(aliceContext!)).toMatchObject({ name: "Garage A", memberCount: 1 });

    // A context naming someone else's workspace gets nothing back.
    const forged = { ...findAccessContext(bob)!, workspace: { id: garageA.id, name: "?" } };
    expect(getWorkspaceOverview(forged)).toBeNull();
  });

  it("rejects unknown membership roles", () => {
    const user = insertUser("Carol");
    const { id } = createWorkspaceWithOwner({ userId: user.id, workspaceName: "Garage C" });
    const other = insertUser("Dave");
    expect(() =>
      getDb()
        .insert(memberships)
        // @ts-expect-error: "admin" is not a valid role; the CHECK constraint must reject it.
        .values({ userId: other.id, workspaceId: id, role: "admin" })
        .run(),
    ).toThrow(/CHECK constraint failed/);
  });
});
