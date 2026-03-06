import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

type GeoPoint = {
  type: 'Point';
  coordinates: [number, number];
};

export enum UserType {
  CLIENT = 'client',
  WORKER = 'worker',
}

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: UserType, default: UserType.CLIENT })
  type: UserType;

  @Column({ unique: true })
  email: string;

  @Column({ unique: true, nullable: true })
  phone?: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name', nullable: true })
  lastName?: string;

  @Column({ name: 'profile_photo_url', nullable: true })
  profilePhotoUrl?: string;

  @Column({
    name: 'current_location',
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  currentLocation?: GeoPoint;

  @Column({ name: 'work_radius_km', type: 'float', default: 5 })
  workRadiusKm: number;

  @Column({ name: 'average_rating', type: 'float', default: 0 })
  averageRating: number;

  @Column({ name: 'completed_jobs', type: 'int', default: 0 })
  completedJobs: number;

  @Column({ name: 'is_available', type: 'boolean', default: false })
  isAvailable: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
