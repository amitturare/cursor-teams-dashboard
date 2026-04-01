import { and, eq } from "drizzle-orm";
import { db } from "../index";
import { groupMembers, userGroups } from "../schema";

export interface GroupData {
  name: string;
  description?: string;
  color?: string;
}

export interface Group {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
  members: string[];
}

export async function listGroups(): Promise<Group[]> {
  const groups = await db.select().from(userGroups);
  const members = await db.select().from(groupMembers);

  return groups.map((g) => ({
    ...g,
    members: members.filter((m) => m.groupId === g.id).map((m) => m.email)
  }));
}

export async function getGroup(id: number): Promise<Group | null> {
  const [group] = await db.select().from(userGroups).where(eq(userGroups.id, id));
  if (!group) return null;
  const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, id));
  return { ...group, members: members.map((m) => m.email) };
}

export async function createGroup(data: GroupData): Promise<Group> {
  const [group] = await db
    .insert(userGroups)
    .values({ name: data.name, description: data.description ?? null, color: data.color ?? null })
    .returning();
  return { ...group, members: [] };
}

export async function updateGroup(id: number, data: Partial<GroupData>): Promise<Group | null> {
  const updates: Partial<typeof userGroups.$inferInsert> = { updatedAt: new Date() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.color !== undefined) updates.color = data.color;

  const [group] = await db.update(userGroups).set(updates).where(eq(userGroups.id, id)).returning();
  if (!group) return null;
  const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, id));
  return { ...group, members: members.map((m) => m.email) };
}

export async function deleteGroup(id: number): Promise<void> {
  await db.delete(userGroups).where(eq(userGroups.id, id));
}

export async function addGroupMembers(groupId: number, emails: string[]): Promise<void> {
  if (emails.length === 0) return;
  await db
    .insert(groupMembers)
    .values(emails.map((email) => ({ groupId, email })))
    .onConflictDoNothing();
}

export async function removeGroupMembers(groupId: number, emails: string[]): Promise<void> {
  if (emails.length === 0) return;
  for (const email of emails) {
    await db
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.email, email)));
  }
}
