import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ enum: UserType, example: UserType.CLIENT })
  @Column({ type: 'enum', enum: UserType, default: UserType.CLIENT })
  type: UserType;

  @ApiProperty({ example: 'usuario@chamba.com' })
  @Column({ unique: true })
  email: string;

  @ApiPropertyOptional({ example: '+59170000000' })
  @Column({ unique: true, nullable: true })
  phone?: string;

  @ApiProperty({ example: 'Juan' })
  @Column({ name: 'first_name' })
  firstName: string;

  @ApiPropertyOptional({ example: 'Pérez' })
  @Column({ name: 'last_name', nullable: true })
  lastName?: string;

  @ApiPropertyOptional({ example: 'https://cdn.chamba.com/profile.jpg' })
  @Column({ name: 'profile_photo_url', nullable: true })
  profilePhotoUrl?: string;

  @ApiPropertyOptional({
    example: {
      type: 'Point',
      coordinates: [-68.1193, -16.4897],
    },
  })
  @Column({
    name: 'current_location',
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  currentLocation?: GeoPoint;

  @ApiProperty({ example: 5 })
  @Column({ name: 'work_radius_km', type: 'float', default: 5 })
  workRadiusKm: number;

  @ApiProperty({ example: 4.7 })
  @Column({ name: 'average_rating', type: 'float', default: 0 })
  averageRating: number;

  @ApiProperty({ example: 25 })
  @Column({ name: 'completed_jobs', type: 'int', default: 0 })
  completedJobs: number;

  @ApiProperty({ example: true })
  @Column({ name: 'is_available', type: 'boolean', default: false })
  isAvailable: boolean;

  @ApiProperty({ type: String, example: '2026-03-08T22:42:26.170Z' })
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty({ type: String, example: '2026-03-08T22:42:26.170Z' })
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
