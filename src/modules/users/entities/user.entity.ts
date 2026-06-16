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

export enum VerificationStatus {
  NOT_VERIFIED = 'not_verified',
  PENDING = 'pending',
  VERIFIED = 'verified',
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

  @ApiPropertyOptional({ example: '70000000' })
  @Column({ nullable: true })
  phone?: string;

  @ApiPropertyOptional({ example: '+591' })
  @Column({ name: 'country_code', nullable: true })
  countryCode?: string;

  @ApiPropertyOptional({ example: '12345678' })
  @Column({ name: 'ci_number', nullable: true })
  ciNumber?: string;

  @ApiPropertyOptional({
    enum: VerificationStatus,
    example: VerificationStatus.NOT_VERIFIED,
  })
  @Column({
    name: 'verification_status',
    type: 'enum',
    enum: VerificationStatus,
    default: VerificationStatus.NOT_VERIFIED,
  })
  verificationStatus: VerificationStatus;

  @ApiPropertyOptional({ example: 'https://cdn.chamba.com/id-photo.jpg' })
  @Column({ name: 'id_photo_url', nullable: true })
  idPhotoUrl?: string;

  @ApiPropertyOptional({ example: 'https://cdn.chamba.com/face-photo.jpg' })
  @Column({ name: 'face_photo_url', nullable: true })
  facePhotoUrl?: string;

  @ApiPropertyOptional({ example: true, nullable: true })
  @Column({ name: 'id_photo_verified', type: 'boolean', nullable: true })
  idPhotoVerified?: boolean | null;

  @ApiPropertyOptional({ example: false, nullable: true })
  @Column({ name: 'face_photo_verified', type: 'boolean', nullable: true })
  facePhotoVerified?: boolean | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '2026-05-23T18:12:00.000Z',
  })
  @Column({
    name: 'verification_reviewed_at',
    type: 'timestamptz',
    nullable: true,
  })
  verificationReviewedAt?: Date | null;

  @ApiProperty({ example: 'Juan' })
  @Column({ name: 'first_name' })
  firstName: string;

  @ApiPropertyOptional({ example: 'Pérez' })
  @Column({ name: 'last_name', nullable: true })
  lastName?: string;

  @ApiPropertyOptional({ example: 'https://cdn.chamba.com/profile.jpg' })
  @Column({ name: 'profile_photo_url', nullable: true })
  profilePhotoUrl?: string;

  @Column({ name: 'profile_photo_public_id', nullable: true })
  profilePhotoPublicId?: string;

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

  @ApiProperty({ example: false })
  @Column({ name: 'is_blocked', type: 'boolean', default: false })
  isBlocked: boolean;

  @ApiPropertyOptional({ type: [String] })
  @Column({ name: 'work_modalities', type: 'jsonb', nullable: true })
  workModalities?: string[];

  @ApiPropertyOptional()
  @Column({
    name: 'hourly_rate',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  hourlyRate?: number;

  @ApiPropertyOptional()
  @Column({
    name: 'daily_rate',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  dailyRate?: number;

  @ApiProperty({ type: String, example: '2026-03-08T22:42:26.170Z' })
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty({ type: String, example: '2026-03-08T22:42:26.170Z' })
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
