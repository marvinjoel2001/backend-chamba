import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedSantaCruzBotsAndUsers1794363500000
  implements MigrationInterface
{
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE chamba_simulation.profiles ADD COLUMN IF NOT EXISTS avatar_url text;`,
    );

    const clientNames = [
      'María Fernanda Justiniano',
      'Luis Fernando Saucedo',
      'Carla Antelo',
      'Juan Carlos Áñez',
      'Daniela Roca',
      'Marcelo Vaca',
      'Gabriela Rivero',
      'José Luis Suárez',
      'Paola Cuéllar',
      'Rodrigo Landívar',
      'Valeria Aguilera',
      'Carlos Eduardo Melgar',
      'Silvana Parada',
      'Mario Dorado',
      'Claudia Chávez',
      'Jorge Hurtado',
      'Natalia Ribera',
      'Fabio Terrazas',
      'Mariana Pinto',
      'Alejandro Montero',
      'Nicole Mercado',
      'Mateo Banegas',
      'Luciana Barba',
      'Mauricio Céspedes',
      'Andrea Soliz',
      'Julio César Paz',
      'Camila Ortiz',
      'Diego Villarroel',
      'Sofía Rojas',
      'Bruno Ribera',
    ];

    const workerNames = [
      'Rosa Mamani',
      'Lourdes Arteaga',
      'Gladys Choque',
      'Carmen Saucedo',
      'Miriam Justiniano',
      'Patricia Colque',
      'Silvia Vaca',
      'Elena Banegas',
      'Freddy Quispe',
      'Wilson Montero',
      'Ronald Vargas',
      'Javier Condori',
      'Walter Banegas',
      'Gustavo Roca',
      'Hugo Terrazas',
      'Jhonny Peña',
      'Edwin Gutiérrez',
      'Mario Flores',
      'Oscar Aguilera',
      'Ricardo Hurtado',
      'Hernán Chávez',
      'Leonardo Pinto',
      'Raúl Melgar',
      'Félix Dorado',
      'Víctor Céspedes',
      'Germán Mercado',
      'Boris Landívar',
      'Jaime Soliz',
      'Roberto Cuéllar',
      'Antonio Parada',
    ];

    const specialties = [
      'Limpieza',
      'Limpieza',
      'Limpieza',
      'Limpieza',
      'Limpieza',
      'Limpieza',
      'Limpieza',
      'Limpieza',
      'Plomería',
      'Plomería',
      'Plomería',
      'Plomería',
      'Plomería',
      'Plomería',
      'Plomería',
      'Plomería',
      'Electricidad',
      'Electricidad',
      'Electricidad',
      'Electricidad',
      'Electricidad',
      'Electricidad',
      'Electricidad',
      'Pintura',
      'Pintura',
      'Pintura',
      'Pintura',
      'Pintura',
      'Pintura',
      'Pintura',
    ];

    const clientPhotos = [
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362818/chamba/bots/wxvul2bcmu3qmk9p9cuj.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362819/chamba/bots/dggt6oa8guj4ilm7buc0.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362819/chamba/bots/tfvntkegzb0zvq83exfw.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362820/chamba/bots/gnyghxni3ao84w8imhzo.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362821/chamba/bots/pa9pv2tp67qdafwluumh.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362821/chamba/bots/jbxg1tec5eygjrru1sex.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362822/chamba/bots/ekl6njsrb7usofz6xr2f.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362823/chamba/bots/occndfimc51t7ynjndsb.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362824/chamba/bots/gqlwstq1kjvoifgqbaer.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362825/chamba/bots/hoyrhuyi0h8rra5oykef.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362825/chamba/bots/xdopsb8ejugknwetohkf.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362826/chamba/bots/kud1xx3pgiqcy6n9iuic.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362827/chamba/bots/mxyyz8hrqljljvtbxqio.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362828/chamba/bots/qbthrykz2y3fseh6p4t4.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362828/chamba/bots/tw0etq70kwsonlqyehrr.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362829/chamba/bots/l2utkdinjiawa7kpzxpj.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362830/chamba/bots/m0cw6llj1mzpiizy0esa.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362830/chamba/bots/zmzmvwiqohlfvws4dsth.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362832/chamba/bots/zdcqacynbiqwuwmsafq8.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362832/chamba/bots/ljbbrsor6lqfzad1qqgp.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362833/chamba/bots/jmgyhhrai5s2p8c2cjc8.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362834/chamba/bots/stm5zhb6wgbfyfe2ngyw.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362835/chamba/bots/elo5sosyyfchnehnlb73.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362835/chamba/bots/mqlfwnftndvhtjpepbla.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362836/chamba/bots/pbzzhi2tmnt7cruxin4k.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362837/chamba/bots/jef7tzyomqxkqcxkhna2.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362838/chamba/bots/pm8muj7tfydqhgqq5ja7.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362839/chamba/bots/l0pxzbi27ha45hsym49n.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362839/chamba/bots/km1dsji4gwfbwagettbg.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362840/chamba/bots/zcl2aowxgvhzqneaxfdt.jpg',
    ];

    const workerPhotos = [
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362841/chamba/bots/gcv9imxrfryvtitb39iq.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362841/chamba/bots/wj5xctmf0zdbuyyafhkq.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362842/chamba/bots/dmjvw9wlchnkmhzoqnuu.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362843/chamba/bots/gdxuymcgenod2r8wlgpi.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362844/chamba/bots/yta6poay1up7iouwfjsa.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362844/chamba/bots/wkilkyjctzsu45lula24.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362845/chamba/bots/fcevuukwbqfmane3irzu.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362845/chamba/bots/jrh7a0frejwhg1jwj9bt.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362846/chamba/bots/wt9hy7lueufsz2ewmkvu.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362847/chamba/bots/ryccvnwxsbzbxfjmkxi2.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362847/chamba/bots/vua23zd61u4xsuralcre.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362848/chamba/bots/htgapovk8mbzmmvte0qk.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362848/chamba/bots/xm6ckyohwhwom4f5e2us.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362850/chamba/bots/vrptivhlhpccn7bwymhf.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362851/chamba/bots/lsty6upwuebkfrekp1uw.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362852/chamba/bots/bhddkotw2cnipn3zhxi8.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362852/chamba/bots/i2kqz8oztesyjavvzzb4.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362853/chamba/bots/m5osujchxxdbg7pnfdhv.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362854/chamba/bots/drz2n46wrwis7lvmya4s.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362854/chamba/bots/licjnl8qgis3aoypcxsr.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362855/chamba/bots/fgljajafbumkfehvjq95.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362855/chamba/bots/vau1kal60rawaszojwwt.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362856/chamba/bots/nlytuuqj51zdnqbnrrf6.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362857/chamba/bots/ep3faukylbtub86tlobd.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362858/chamba/bots/tztso6h6nj8djzilbvi3.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362859/chamba/bots/dool5shqeeu2j1gt7s6w.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362859/chamba/bots/vnskzud5tjdn0wmu7b0t.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362860/chamba/bots/xhmhkdy2hutqk8h7jjmf.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362861/chamba/bots/aiupwrrtd2uojks3mgrl.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794362862/chamba/bots/nmezgpi8gp6wlryuicjc.jpg',
    ];

    const colors = ['#7c3aed', '#2563eb', '#059669', '#db2777', '#d97706'];

    // 1. Aprovisionar 30 perfiles de clientes y 30 de trabajadores en chamba_simulation.profiles
    for (let i = 0; i < 30; i++) {
      const clientCode = `CLIENT-${String(i + 1).padStart(2, '0')}`;
      const workerCode = `WORKER-${String(i + 1).padStart(2, '0')}`;
      const color = colors[i % colors.length];
      const spec = specialties[i];

      await q.query(
        `INSERT INTO chamba_simulation.profiles(id, role, name, avatar_color, specialty, avatar_url)
         VALUES($1, 'client', $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           avatar_url = EXCLUDED.avatar_url,
           specialty = EXCLUDED.specialty`,
        [clientCode, clientNames[i], color, spec, clientPhotos[i]],
      );

      await q.query(
        `INSERT INTO chamba_simulation.profiles(id, role, name, avatar_color, specialty, avatar_url)
         VALUES($1, 'worker', $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           avatar_url = EXCLUDED.avatar_url,
           specialty = EXCLUDED.specialty`,
        [workerCode, workerNames[i], color, spec, workerPhotos[i]],
      );
    }

    // 2. Crear los 30 clientes y 30 trabajadores en la tabla 'users' para las pestañas de Clientes y Trabajadores del Admin
    for (let i = 0; i < 30; i++) {
      const clientParts = clientNames[i].split(' ');
      const clientFirst = clientParts[0];
      const clientLast = clientParts.slice(1).join(' ');
      const clientEmail = `cliente.bot${String(i + 1).padStart(2, '0')}@chamba.bo`;
      const clientPhone = `7${String(1000000 + i * 2931).slice(0, 7)}`;
      const clientPhoto = clientPhotos[i];
      const clientLat = -17.7833 + Math.sin((i + 1) * 1.3) * 0.035;
      const clientLng = -63.1821 + Math.cos((i + 1) * 1.3) * 0.035;

      await q.query(
        `INSERT INTO users (type, email, phone, country_code, first_name, last_name, profile_photo_url,
          current_location, location_updated_at, verification_status, average_rating, completed_jobs, is_available)
        VALUES ('client', $1, $2, '+591', $3, $4, $5,
          ST_SetSRID(ST_MakePoint($7, $6), 4326), now(), 'verified', 5.0, 0, true)
        ON CONFLICT (email) DO UPDATE SET
          profile_photo_url = EXCLUDED.profile_photo_url,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          current_location = EXCLUDED.current_location,
          location_updated_at = now()`,
        [
          clientEmail,
          clientPhone,
          clientFirst,
          clientLast,
          clientPhoto,
          clientLat,
          clientLng,
        ],
      );

      const workerParts = workerNames[i].split(' ');
      const workerFirst = workerParts[0];
      const workerLast = workerParts.slice(1).join(' ');
      const workerEmail = `trabajador.bot${String(i + 1).padStart(2, '0')}@chamba.bo`;
      const workerPhone = `7${String(2000000 + i * 3147).slice(0, 7)}`;
      const workerPhoto = workerPhotos[i];
      const workerLat = -17.7833 + Math.cos((i + 1) * 1.1) * 0.04;
      const workerLng = -63.1821 + Math.sin((i + 1) * 1.1) * 0.04;
      const rating = +(4.6 + ((i * 7) % 5) * 0.1).toFixed(1);
      const completedJobs = 8 + ((i * 3) % 40);

      await q.query(
        `INSERT INTO users (type, email, phone, country_code, first_name, last_name, profile_photo_url,
          current_location, location_updated_at, verification_status, average_rating, completed_jobs, is_available, work_modalities)
        VALUES ('worker', $1, $2, '+591', $3, $4, $5,
          ST_SetSRID(ST_MakePoint($7, $6), 4326), now(), 'verified', $8, $9, true, $10)
        ON CONFLICT (email) DO UPDATE SET
          profile_photo_url = EXCLUDED.profile_photo_url,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          current_location = EXCLUDED.current_location,
          location_updated_at = now(),
          work_modalities = EXCLUDED.work_modalities`,
        [
          workerEmail,
          workerPhone,
          workerFirst,
          workerLast,
          workerPhoto,
          workerLat,
          workerLng,
          rating,
          completedJobs,
          JSON.stringify([specialties[i]]),
        ],
      );
    }
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DELETE FROM users WHERE email LIKE 'cliente.bot%@chamba.bo' OR email LIKE 'trabajador.bot%@chamba.bo';
      DELETE FROM chamba_simulation.profiles WHERE id LIKE 'CLIENT-%' OR id LIKE 'WORKER-%';
    `);
  }
}
