import {sqliteTable,text,integer,index,primaryKey} from 'drizzle-orm/sqlite-core';
export const datasets=sqliteTable('datasets',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),name:text('name').notNull(),rowCount:integer('row_count').notNull(),columnCount:integer('column_count').notNull(),byteCount:integer('byte_count').notNull(),configJson:text('config_json'),summaryJson:text('summary_json'),revision:integer('revision').notNull().default(1),archived:integer('archived').notNull().default(0),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()
},t=>[index('datasets_owner_idx').on(t.ownerId,t.archived)]);
export const datasetChunks=sqliteTable('dataset_chunks',{
 datasetId:text('dataset_id').notNull().references(()=>datasets.id,{onDelete:'cascade'}),kind:text('kind').notNull(),position:integer('position').notNull(),content:text('content').notNull()
},t=>[primaryKey({columns:[t.datasetId,t.kind,t.position]})]);
