import * as bcrypt from 'bcryptjs';
import AppDataSource from '../../../data-source';

/**
 * Crea (o actualiza la contraseña de) una agencia para el panel agency-chamba.
 *
 * Uso:
 *   npm run seed:agency
 *   AGENCY_EMAIL=otra@agencia.com AGENCY_PASSWORD=secreto AGENCY_NAME="Mi Agencia" npm run seed:agency
 */
async function run() {
  const email = process.env.AGENCY_EMAIL ?? 'agencia@chamba.com';
  const password = process.env.AGENCY_PASSWORD ?? 'agencia123';
  const name = process.env.AGENCY_NAME ?? 'Agencia Demo';

  await AppDataSource.initialize();

  const accounts = [
    {
      email: process.env.AGENCY_EMAIL ?? 'agencia@chamba.com',
      password: process.env.AGENCY_PASSWORD ?? 'agencia123',
      name: process.env.AGENCY_NAME ?? 'Agencia Demo',
    },
    {
      email: 'agencia@chamba.bo',
      password: 'password123',
      name: 'Agencia Chamba Bolivia',
    },
  ];

  for (const account of accounts) {
    const passwordHash = await bcrypt.hash(
      account.password,
      await bcrypt.genSalt(),
    );

    const existing = await AppDataSource.query(
      `SELECT id FROM agencies WHERE LOWER(contact_email) = LOWER($1) LIMIT 1`,
      [account.email],
    );

    if (existing[0]) {
      await AppDataSource.query(
        `
        UPDATE agencies
        SET password_hash = $2, is_active = true, updated_at = NOW()
        WHERE id = $1
        `,
        [existing[0].id, passwordHash],
      );
      console.log(
        `Agencia existente actualizada: ${existing[0].id} (${account.email})`,
      );
    } else {
      const rows = await AppDataSource.query(
        `
        INSERT INTO agencies (name, contact_email, password_hash, is_active)
        VALUES ($1, $2, $3, true)
        RETURNING id
        `,
        [account.name, account.email, passwordHash],
      );
      console.log(`Agencia creada: ${rows[0].id} (${account.email})`);
    }

    console.log(`Credenciales: ${account.email} / ${account.password}`);
  }
  await AppDataSource.destroy();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
