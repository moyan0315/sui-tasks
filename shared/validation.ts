import { z } from "zod";
import { statuses } from "./model";
export const taskSchema = z.object({
  id: z.uuid(),
  text: z.string().trim().min(1).max(10000),
  status: z.enum(statuses),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deleted: z.boolean(),
  version: z.number().int().min(0),
  mutationId: z.uuid(),
});
export const candidatesSchema = z.object({
  tasks: z
    .array(z.object({ text: z.string().trim().min(1).max(1000) }))
    .min(1)
    .max(12),
});
