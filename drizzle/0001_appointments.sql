CREATE TYPE "public"."interval_unit" AS ENUM('week', 'month');--> statement-breakpoint
CREATE TABLE "appointment_horses" (
	"appointment_id" uuid NOT NULL,
	"horse_id" uuid NOT NULL,
	CONSTRAINT "appointment_horses_appointment_id_horse_id_pk" PRIMARY KEY("appointment_id","horse_id")
);
--> statement-breakpoint
CREATE TABLE "appointment_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'slate' NOT NULL,
	"interval_count" smallint,
	"interval_unit" interval_unit,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_types_interval_set_ck" CHECK (("appointment_types"."interval_count" IS NULL) = ("appointment_types"."interval_unit" IS NULL)),
	CONSTRAINT "appointment_types_interval_range_ck" CHECK ("appointment_types"."interval_unit" IS NULL OR ("appointment_types"."interval_unit" = 'week' AND "appointment_types"."interval_count" BETWEEN 1 AND 52) OR ("appointment_types"."interval_unit" = 'month' AND "appointment_types"."interval_count" BETWEEN 1 AND 36))
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type_id" uuid NOT NULL,
	"date" date NOT NULL,
	"time" text,
	"note" text DEFAULT '' NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_time_ck" CHECK ("appointments"."time" IS NULL OR "appointments"."time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
--> statement-breakpoint
ALTER TABLE "appointment_horses" ADD CONSTRAINT "appointment_horses_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_horses" ADD CONSTRAINT "appointment_horses_horse_id_horses_id_fk" FOREIGN KEY ("horse_id") REFERENCES "public"."horses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_type_id_appointment_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."appointment_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_horses_horse_idx" ON "appointment_horses" USING btree ("horse_id");--> statement-breakpoint
CREATE INDEX "appointment_types_user_idx" ON "appointment_types" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "appointments_user_date_idx" ON "appointments" USING btree ("user_id","date");