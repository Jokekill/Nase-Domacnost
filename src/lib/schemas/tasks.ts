import { z } from "zod";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Očekáváno YYYY-MM-DD");

export const taskListUpsertSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(60),
  sortOrder: z.number().int().default(0),
});

export const templateGroupUpsertSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(60),
  taskListId: uuid.nullish(),
  sortOrder: z.number().int().default(0),
});

export const taskTemplateUpsertSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullish(),
  taskListId: uuid.nullish(),
  templateGroupId: uuid.nullish(),
  intervalDays: z.number().int().positive().max(3650).nullish(),
  sortOrder: z.number().int().default(0),
});

export const createTasksSchema = z
  .object({
    taskListId: uuid.nullish(),
    periodStart: isoDate.nullish(),
    periodEnd: isoDate.nullish(),
    templateIds: z.array(uuid).default([]),
    customNames: z.array(z.string().trim().min(1).max(120)).default([]),
  })
  .refine(
    (input) => input.templateIds.length > 0 || input.customNames.length > 0,
    { message: "Vyber aspoň jeden úkol." },
  );

export const taskPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).nullish(),
  taskListId: uuid.nullish(),
  periodStart: isoDate.nullish(),
  periodEnd: isoDate.nullish(),
  dueAt: z.string().datetime({ offset: true }).nullish(),
});

export const assignSchema = z.object({
  taskIds: z.array(uuid).min(1),
  userId: uuid,
  mode: z.enum(["add", "replace"]).default("add"),
});

export const completeSchema = z.object({ done: z.boolean() });

export const taskQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  listId: uuid.optional(),
  status: z.enum(["open", "done"]).optional(),
});
