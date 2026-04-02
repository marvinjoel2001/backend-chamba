import { MobileService } from './mobile.service';
export declare class MobileController {
    private readonly mobileService;
    constructor(mobileService: MobileService);
    register(type: string, email: string, phone: string | undefined, firstName: string, lastName: string | undefined, password: string): Promise<any>;
    login(identifier: string, password: string): Promise<{
        user: {
            id: any;
            type: any;
            firstName: any;
            lastName: any;
            email: any;
            phone: any;
            profilePhotoUrl: any;
        };
    }>;
    checkIdentifier(identifier: string): Promise<{
        exists: boolean;
    }>;
    getExploreData(userId: string, lat?: string, lng?: string, radiusKm?: string): Promise<{
        user: {
            id: any;
            type: any;
            firstName: any;
            lastName: any;
            email: any;
            phone: any;
            profilePhotoUrl: any;
            profilePhotoPublicId: any;
            isAvailable: any;
            workRadiusKm: number;
            currentLatitude: number | null;
            currentLongitude: number | null;
        };
        categories: any;
        activeRequest: {
            id: any;
            clientUserId: any;
            title: any;
            description: any;
            category: any;
            aiCategories: {
                id: string;
                name: string;
                confidence: number;
            }[];
            budget: number;
            priceType: any;
            address: any;
            status: any;
            createdAt: any;
        } | null;
        nearbyWorkers: any;
    }>;
    createRequest(clientUserId: string, title: string, description: string, category: string | undefined, aiCategories: Array<{
        id: string;
        name?: string;
        nombre?: string;
        confidence?: number;
        confianza?: number;
    }> | undefined, budget: number, priceType: string, address: string, latitude: number, longitude: number, scheduledAt?: string, photosBase64?: string[], photos?: Array<{
        url?: string;
        publicId?: string;
    }>): Promise<{
        request: {
            id: any;
            status: any;
            title: any;
            budget: number;
            address: any;
            aiCategories: {
                id: string;
                name: string;
                confidence: number;
            }[];
            createdAt: any;
            photos: string[];
        };
        notifiedWorkers: any;
    }>;
    getCategories(): Promise<{
        categories: any;
    }>;
    createCategory(id: string | undefined, name: string, description?: string, icon?: string, parentId?: string, active?: boolean): Promise<{
        category: {
            id: any;
            name: any;
            description: any;
            icon: any;
            parentId: any;
            active: any;
            createdAt: any;
            updatedAt: any;
        };
    }>;
    uploadProfilePhoto(userId: string, imageBase64?: string, imageUrl?: string, imagePublicId?: string): Promise<{
        user: {
            id: any;
            type: any;
            firstName: any;
            lastName: any;
            email: any;
            phone: any;
            profilePhotoUrl: any;
            profilePhotoPublicId: any;
            isAvailable: any;
            workRadiusKm: number;
            currentLatitude: number | null;
            currentLongitude: number | null;
        };
    }>;
    removeProfilePhoto(userId: string): Promise<{
        user: {
            id: any;
            type: any;
            firstName: any;
            lastName: any;
            email: any;
            phone: any;
            profilePhotoUrl: any;
            profilePhotoPublicId: any;
            isAvailable: any;
            workRadiusKm: number;
            currentLatitude: number | null;
            currentLongitude: number | null;
        };
    }>;
    deleteRequestPhoto(requestPhotoId: string, clientUserId: string): Promise<{
        deleted: boolean;
        requestPhotoId: string;
        requestId: any;
    }>;
    upsertPushToken(userId: string, token: string, platform?: string): Promise<{
        pushToken: any;
    }>;
    getRequestStatus(requestId?: string, clientUserId?: string): Promise<{
        request: {
            photos: any;
            id: any;
            clientUserId: any;
            title: any;
            description: any;
            category: any;
            aiCategories: {
                id: string;
                name: string;
                confidence: number;
            }[];
            budget: number;
            priceType: any;
            address: any;
            status: any;
            createdAt: any;
        } | {
            photos: any;
            id: any;
            client_user_id: any;
            title: any;
            description: any;
            category: any;
            aiCategories: {
                id: string;
                name: string;
                confidence: number;
            }[];
            budget: number;
            price_type: any;
            address: any;
            status: any;
            location: any;
            created_at: any;
        };
        metrics: {
            offersCount: number;
            acceptedCount: number;
            estimatedMinutes: number | null;
        };
        topOffers: any;
    }>;
    getOffers(requestId?: string, clientUserId?: string): Promise<{
        request: {
            photos: any;
            id: any;
            clientUserId: any;
            title: any;
            description: any;
            category: any;
            aiCategories: {
                id: string;
                name: string;
                confidence: number;
            }[];
            budget: number;
            priceType: any;
            address: any;
            status: any;
            createdAt: any;
        } | {
            photos: any;
            id: any;
            client_user_id: any;
            title: any;
            description: any;
            category: any;
            aiCategories: {
                id: string;
                name: string;
                confidence: number;
            }[];
            budget: number;
            price_type: any;
            address: any;
            status: any;
            location: any;
            created_at: any;
        };
        offers: any;
        offerLifetimeSeconds: number;
    }>;
    getWorkerProfile(workerId: string): Promise<{
        worker: {
            id: any;
            firstName: any;
            lastName: any;
            profilePhotoUrl: any;
            averageRating: number;
            completedJobs: number;
            workRadiusKm: number;
            skills: any;
            bio: string;
            gallery: any;
        };
        reviews: any;
    }>;
    getMessages(userId: string): Promise<{
        threads: any;
    }>;
    getThreadMessages(threadId: string): Promise<{
        threadId: string;
        messages: any;
    }>;
    sendThreadMessage(threadId: string, senderUserId: string, content: string): Promise<{
        message: {
            id: any;
            senderUserId: any;
            content: any;
            createdAt: any;
        };
    }>;
    getIncomingRequest(workerUserId: string): Promise<{
        request: null;
        offerLifetimeSeconds?: undefined;
    } | {
        offerLifetimeSeconds: number;
        request: {
            id: any;
            title: any;
            description: any;
            category: any;
            budget: number;
            address: any;
            status: any;
            distanceKm: number | null;
            client: {
                id: any;
                name: string;
            };
            workerOffer: {
                id: any;
                amount: number;
                status: any;
                expiresAt: any;
                secondsRemaining: number | null;
            } | null;
        };
    }>;
    upsertOffer(requestId: string, workerUserId: string, amount: number, message?: string): Promise<{
        offer: {
            id: string;
            requestId: string;
            workerUserId: string;
            amount: number;
            message: string;
            status: string;
        };
    }>;
    acceptOffer(offerId: string, clientUserId: string): Promise<{
        accepted: boolean;
        requestId: any;
        workerUserId: any;
    }>;
    getTracking(requestId: string): Promise<{
        requestId: any;
        address: any;
        distanceKm: number | null;
        etaMinutes: number | null;
        agreedAmount: number;
        worker: {
            id: any;
            firstName: any;
            lastName: any;
            profilePhotoUrl: any;
        };
    }>;
    getWorkerRadar(workerUserId: string): Promise<{
        worker: {
            id: any;
            type: any;
            firstName: any;
            lastName: any;
            email: any;
            phone: any;
            profilePhotoUrl: any;
            profilePhotoPublicId: any;
            isAvailable: any;
            workRadiusKm: number;
            currentLatitude: number | null;
            currentLongitude: number | null;
        };
        available: any;
        location: {
            latitude: number | null;
            longitude: number | null;
            workRadiusKm: number;
        };
        summary: {
            jobsToday: number;
            earningsToday: number;
            nearbyRequests: number;
        };
        skills: any;
    }>;
    setWorkerAvailability(workerUserId: string, available: boolean): Promise<{
        workerId: any;
        isAvailable: any;
    }>;
    updateWorkerLocation(workerUserId: string, latitude: number, longitude: number): Promise<{
        workerId: any;
        latitude: number;
        longitude: number;
    }>;
    getWorkerSkills(workerUserId: string): Promise<{
        workerUserId: string;
        skills: any;
    }>;
    getWorkerHistory(workerUserId: string): Promise<{
        workerUserId: string;
        jobs: any;
    }>;
    updateWorkerSkills(workerUserId: string, skills: string[]): Promise<{
        workerUserId: string;
        skills: string[];
    }>;
    createReview(requestId: string, workerUserId: string, clientUserId: string, stars: number, comment?: string): Promise<{
        saved: boolean;
        workerUserId: string;
        averageRating: number;
        completedJobs: number;
    }>;
}
