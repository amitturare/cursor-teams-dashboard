CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_email" text,
	"event_type" text,
	"timestamp" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	"synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_usage_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_email" text NOT NULL,
	"date" date NOT NULL,
	"user_id" integer,
	"is_active" boolean,
	"total_lines_added" integer,
	"total_lines_deleted" integer,
	"accepted_lines_added" integer,
	"accepted_lines_deleted" integer,
	"total_applies" integer,
	"total_accepts" integer,
	"total_rejects" integer,
	"total_tabs_shown" integer,
	"total_tabs_accepted" integer,
	"composer_requests" integer,
	"chat_requests" integer,
	"agent_requests" integer,
	"cmdk_usages" integer,
	"subscription_reqs" integer,
	"usage_based_reqs" integer,
	"api_key_reqs" integer,
	"bugbot_usages" integer,
	"most_used_model" text,
	"apply_ext" text,
	"tab_ext" text,
	"client_version" text,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "daily_usage_rows_user_email_date_unique" UNIQUE("user_email","date")
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"email" text NOT NULL,
	CONSTRAINT "group_members_group_id_email_unique" UNIQUE("group_id","email")
);
--> statement-breakpoint
CREATE TABLE "sync_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"data_type" text NOT NULL,
	"date" date NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sync_log_data_type_date_unique" UNIQUE("data_type","date")
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"cursor_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" text,
	"is_removed" boolean DEFAULT false,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "team_members_cursor_id_unique" UNIQUE("cursor_id"),
	CONSTRAINT "team_members_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_email" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"model" text,
	"kind" text,
	"data" jsonb NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "usage_events_user_email_timestamp_model_kind_unique" UNIQUE("user_email","timestamp","model","kind")
);
--> statement-breakpoint
CREATE TABLE "user_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_user_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."user_groups"("id") ON DELETE cascade ON UPDATE no action;