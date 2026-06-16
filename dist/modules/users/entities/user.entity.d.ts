type GeoPoint = {
    type: 'Point';
    coordinates: [number, number];
};
export declare enum UserType {
    CLIENT = "client",
    WORKER = "worker"
}
export declare enum VerificationStatus {
    NOT_VERIFIED = "not_verified",
    PENDING = "pending",
    VERIFIED = "verified"
}
export declare class User {
    id: string;
    type: UserType;
    email: string;
    phone?: string;
    countryCode?: string;
    ciNumber?: string;
    verificationStatus: VerificationStatus;
    idPhotoUrl?: string;
    facePhotoUrl?: string;
    idPhotoVerified?: boolean | null;
    facePhotoVerified?: boolean | null;
    verificationReviewedAt?: Date | null;
    firstName: string;
    lastName?: string;
    profilePhotoUrl?: string;
    profilePhotoPublicId?: string;
    currentLocation?: GeoPoint;
    workRadiusKm: number;
    averageRating: number;
    completedJobs: number;
    isAvailable: boolean;
    isBlocked: boolean;
    workModalities?: string[];
    hourlyRate?: number;
    dailyRate?: number;
    createdAt: Date;
    updatedAt: Date;
}
export {};
