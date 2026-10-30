CREATE TABLE `dataset_chunks` (
	`dataset_id` text NOT NULL,
	`kind` text NOT NULL,
	`position` integer NOT NULL,
	`content` text NOT NULL,
	PRIMARY KEY(`dataset_id`, `kind`, `position`),
	FOREIGN KEY (`dataset_id`) REFERENCES `datasets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `datasets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`row_count` integer NOT NULL,
	`column_count` integer NOT NULL,
	`byte_count` integer NOT NULL,
	`config_json` text,
	`summary_json` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `datasets_owner_idx` ON `datasets` (`owner_id`,`archived`);