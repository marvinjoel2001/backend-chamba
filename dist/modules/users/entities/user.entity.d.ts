type GeoPoint = {
    type: 'Point';
    coordinates: [number, number];
};
export declare enum UserType {
    CLIENT = "client",
    WORKER = "worker"
}
export declare class User {
    id: string;
    type: UserType;
    email: string;
    phone?: string;
    firstName: string;
    lastName?: string;
    profilePhotoUrl?: string;
    currentLocation?: GeoPoint;
    workRadiusKm: number;
    averageRating: number;
    completedJobs: number;
    isAvailable: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export {};
