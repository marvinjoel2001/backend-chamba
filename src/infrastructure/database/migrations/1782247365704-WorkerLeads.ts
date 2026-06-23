import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkerLeads1782247365704 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "worker_leads" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "fullName" character varying NOT NULL,
                "whatsapp" character varying NOT NULL,
                "email" character varying,
                "city" character varying NOT NULL,
                "category" character varying NOT NULL,
                "isContacted" boolean NOT NULL DEFAULT false,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_worker_leads_id" PRIMARY KEY ("id")
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "worker_leads"`);
    }

}
