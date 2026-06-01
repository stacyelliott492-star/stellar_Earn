import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayoutIdempotencyKey1800000000004 implements MigrationInterface {
  name = 'AddPayoutIdempotencyKey1800000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "idempotencyKey" VARCHAR(255)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_payouts_idempotency_key"
       ON "payouts" ("idempotencyKey")
       WHERE "idempotencyKey" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_payouts_idempotency_key"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payouts" DROP COLUMN IF EXISTS "idempotencyKey"`,
    );
  }
}
