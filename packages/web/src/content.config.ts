import { defineCollection, z } from "astro:content"

const docs = defineCollection({
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    order: z.number().int().nonnegative().optional(),
  }),
})

export const collections = {
  docs,
}
