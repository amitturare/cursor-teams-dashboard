CREATE TABLE "team_spend" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"email" text NOT NULL,
	"name" text,
	"role" text,
	"spend_cents" integer,
	"overall_spend_cents" integer,
	"fast_premium_requests" integer,
	"hard_limit_override_dollars" integer,
	"monthly_limit_dollars" integer,
	"billing_cycle_start" timestamp with time zone,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "team_spend_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "team_spend_email_unique" UNIQUE("email")
);
