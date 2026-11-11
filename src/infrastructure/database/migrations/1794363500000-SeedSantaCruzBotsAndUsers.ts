import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedSantaCruzBotsAndUsers1794363500000
  implements MigrationInterface
{
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE chamba_simulation.profiles ADD COLUMN IF NOT EXISTS avatar_url text;`,
    );

    const clientNames = [
      // 15 mujeres (índices 0..14)
      'María Fernanda Justiniano',
      'Carla Antelo',
      'Daniela Roca',
      'Gabriela Rivero',
      'Paola Cuéllar',
      'Valeria Aguilera',
      'Silvana Parada',
      'Claudia Chávez',
      'Natalia Ribera',
      'Mariana Pinto',
      'Nicole Mercado',
      'Luciana Barba',
      'Andrea Soliz',
      'Camila Ortiz',
      'Sofía Rojas',
      // 15 varones (índices 15..29)
      'Luis Fernando Saucedo',
      'Juan Carlos Áñez',
      'Marcelo Vaca',
      'José Luis Suárez',
      'Rodrigo Landívar',
      'Carlos Eduardo Melgar',
      'Mario Dorado',
      'Jorge Hurtado',
      'Fabio Terrazas',
      'Alejandro Montero',
      'Mateo Banegas',
      'Mauricio Céspedes',
      'Julio César Paz',
      'Diego Villarroel',
      'Bruno Ribera',
    ];

    const workerNames = [
      // 10 mujeres (índices 0..9)
      'Rosa Mamani',
      'Lourdes Arteaga',
      'Gladys Choque',
      'Carmen Saucedo',
      'Miriam Justiniano',
      'Patricia Colque',
      'Silvia Vaca',
      'Elena Banegas',
      'Roxana Flores',
      'Martha Gutiérrez',
      // 20 varones (índices 10..29)
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
    ];

    const specialties = [
      // 9 Limpieza (mujeres), 1 Pintura (mujer), 7 Plomería (varones), 7 Electricidad (varones), 5 Pintura (varones), 1 Plomería (varón) (total 30)
      'Limpieza',
      'Limpieza',
      'Limpieza',
      'Limpieza',
      'Limpieza',
      'Limpieza',
      'Limpieza',
      'Limpieza',
      'Limpieza',
      'Pintura',
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
      'Plomería',
    ];

    const clientPhotos = [
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366699/chamba/bots_v2/sxmlorxj7and7mpatosr.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366700/chamba/bots_v2/dkwcoebxekwhvwoinenf.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366701/chamba/bots_v2/ucfsihoz9cumc92qb9af.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366701/chamba/bots_v2/mcrxbbxxqgqgyv0fupzs.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366702/chamba/bots_v2/uj5mcn0tctid6cdk4bq6.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366702/chamba/bots_v2/uocl7xwjw8pqwvruow9b.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366703/chamba/bots_v2/kvflrxe5xtaw02ebxaju.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366704/chamba/bots_v2/hhb3yng9muh1ho0m9770.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366704/chamba/bots_v2/v0ixlqkw8fds0wicq54e.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366705/chamba/bots_v2/mzh1sohixticu2vqsx0g.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366706/chamba/bots_v2/y6ia5dxr9daiqemodqe7.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366707/chamba/bots_v2/pkae1cmskfknl68kmxco.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366707/chamba/bots_v2/wsp0bj5vucaar46cac87.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366708/chamba/bots_v2/sne20deqnvjuaqzjteyq.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366709/chamba/bots_v2/wh5nuitsky9kxbktcfk8.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366709/chamba/bots_v2/wnc0zykul5qb7f16dwyj.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366710/chamba/bots_v2/ralknwcg3okrhjpsr12r.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366710/chamba/bots_v2/hzbsds1dhbium2t7aowi.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366711/chamba/bots_v2/jkioqzydvnrwp2xqhd46.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366712/chamba/bots_v2/ggxqde6hgxz0qsdb0gvp.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366712/chamba/bots_v2/tgzqljstpdxcxcmmsdcc.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366713/chamba/bots_v2/cqzm6tswz5jkrxfzlfgx.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366713/chamba/bots_v2/hhxpg7qkdo5slepsazzz.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366714/chamba/bots_v2/xrgcndlbldmt1anwnayr.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366715/chamba/bots_v2/ffun6yn6y9k93oxghahr.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366715/chamba/bots_v2/lnpg0wryo4oni4ftdmlx.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366716/chamba/bots_v2/zw5oinbekljkurqnqupu.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366716/chamba/bots_v2/sk0hwenhsyp76jkbmken.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366717/chamba/bots_v2/ytmrhwrq7yt6u7f263rv.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366718/chamba/bots_v2/ion6avpqdyhux6jduwil.jpg',
    ];

    const workerPhotos = [
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366719/chamba/bots_v2/vuftrnlvmdqrjokgcw4h.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366719/chamba/bots_v2/ximty8xfzdjnbpdbzjkh.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366720/chamba/bots_v2/f8klaxwe6kuvhfyqbfnp.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366720/chamba/bots_v2/fmivm6yfl8okwec4hjye.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366722/chamba/bots_v2/y5vlerotuwnpkbrovkko.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366723/chamba/bots_v2/yvw5lnhsb8hkbfw8xdvg.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366723/chamba/bots_v2/sxbxd3ld6jwokq1mgjga.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366724/chamba/bots_v2/difz2tzitbofrv4zyt86.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366725/chamba/bots_v2/o1rjpzv6pn7dc3j31lxh.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366725/chamba/bots_v2/e6kslurynpjpb33tc8mo.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366727/chamba/bots_v2/zuor9z6622n8gplwfa3x.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366727/chamba/bots_v2/khisuyi7rthynueqak5e.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366728/chamba/bots_v2/cznfk5bcztwsvjq2mkfr.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366729/chamba/bots_v2/fhbkqosuoh8jag7ti9bk.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366730/chamba/bots_v2/cdhh4wx15hx3nmcszemp.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366730/chamba/bots_v2/hxqetujmzghuexun82fy.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366731/chamba/bots_v2/czjsnbxgcfpwtopsn60v.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366732/chamba/bots_v2/x2ylbhoenlmxmbki4e2x.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366733/chamba/bots_v2/qslgaef3o0wmoqaf7mmb.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366733/chamba/bots_v2/hyapyjcfxeow3mvbvbnf.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366734/chamba/bots_v2/jyr099noulmzekcdzrsz.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366734/chamba/bots_v2/wfkmpulsfgeyhiswgibg.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366735/chamba/bots_v2/hs6ucfubk911hxzfkqwt.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366736/chamba/bots_v2/oghp4ns3t4i4mybiieb5.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366737/chamba/bots_v2/zpbwhvegnsfm7orawzcx.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366737/chamba/bots_v2/cogvyxan7teicwcz9pdk.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366738/chamba/bots_v2/mc5qq4expkbeoaadisl0.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366738/chamba/bots_v2/hzy9hwlon6yasbybigia.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366739/chamba/bots_v2/vbvp9jyiow6wkmaiuacm.jpg',
      'https://res.cloudinary.com/dpdpgl5kg/image/upload/v1794366740/chamba/bots_v2/f67x0nlks079oga6insi.jpg',
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
