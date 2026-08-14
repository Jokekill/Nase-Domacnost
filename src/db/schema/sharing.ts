import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { households, users } from "./auth";
import { recipes } from "./cookbook";
import { syncColumns } from "./helpers";

export const SHARE_PERMISSIONS = ["view", "edit"] as const;
export type SharePermission = (typeof SHARE_PERMISSIONS)[number];

/**
 * Sharing a single recipe with a single user (docs/DATA-MODEL.md §9).
 *
 * A share WIDENS access, never narrows it: a `household` recipe stays visible
 * to the household even when it is also shared with someone outside of it.
 * Access to a recipe is not access to the household — every household endpoint
 * still goes through requireHousehold (docs/ARCHITECTURE.md §2.2).
 *
 * `household_id` is the OWNER's household (the recipe's), so the row travels
 * with the recipe in sync and change_log.
 */
export const recipeShares = pgTable(
  "recipe_shares",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    permission: text("permission", { enum: SHARE_PERMISSIONS })
      .notNull()
      .default("view"),
  },
  (t) => [
    index("recipe_shares_recipe_idx").on(t.recipeId),
    index("recipe_shares_user_idx").on(t.userId),
  ],
);

/**
 * Public read-only link, gated by the PUBLIC_SHARING_ENABLED flag.
 * Only the SHA-256 of the token is stored — same rule as sessions and
 * invites (docs/ARCHITECTURE.md §1.2).
 */
export const recipePublicLinks = pgTable(
  "recipe_public_links",
  {
    ...syncColumns,
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [index("recipe_public_links_recipe_idx").on(t.recipeId)],
);
