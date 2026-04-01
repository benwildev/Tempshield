import { pgTable, serial, text, jsonb, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const paymentSettingsTable = pgTable("payment_settings", {
  id: serial("id").primaryKey(),
  gateway: text("gateway").notNull().default("MANUAL"),
  stripeEnabled: boolean("stripe_enabled").notNull().default(false),
  stripePublishableKey: text("stripe_publishable_key"),
  stripeSecretKey: text("stripe_secret_key"),
  stripeWebhookSecret: text("stripe_webhook_secret"),
  paypalEnabled: boolean("paypal_enabled").notNull().default(false),
  paypalClientId: text("paypal_client_id"),
  paypalSecret: text("paypal_secret"),
  paypalMode: text("paypal_mode").notNull().default("sandbox"),
  planPrices: jsonb("plan_prices").$type<Record<string, number>>().default({ BASIC: 9, PRO: 29 }),
  freeVerifyLimit: integer("free_verify_limit").notNull().default(5),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PaymentSettings = typeof paymentSettingsTable.$inferSelect;
