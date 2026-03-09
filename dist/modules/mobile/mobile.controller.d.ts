import { MobileService } from './mobile.service';
export declare class MobileController {
    private readonly mobileService;
    constructor(mobileService: MobileService);
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
    getExploreData(userId: string, lat?: string, lng?: string, radiusKm?: string): Promise<{
        user: {
            id: any;
            type: any;
            firstName: any;
            lastName: any;
            email: any;
            phone: any;
            profilePhotoUrl: any;
            isAvailable: any;
        };
        categories: string[];
        activeRequest: {
            id: any;
            clientUserId: any;
            title: any;
            description: any;
            category: any;
            budget: number;
            priceType: any;
            address: any;
            status: any;
            createdAt: any;
        } | null;
        nearbyWorkers: {
            id: any;
            firstName: any;
            lastName: any;
            profilePhotoUrl: any;
            averageRating: number;
            completedJobs: number;
            isAvailable: any;
            workRadiusKm: number;
            latitude: number;
            longitude: number;
            distanceKm: number;
            skills: any;
        }[];
    }>;
    createRequest(clientUserId: string, title: string, description: string, category: string, budget: number, priceType: string, address: string, latitude: number, longitude: number, scheduledAt?: string): Promise<{
        request: {
            id: any;
            status: any;
            title: any;
            budget: number;
            address: any;
            createdAt: any;
        };
        notifiedWorkers: number;
    }>;
    getRequestStatus(requestId?: string, clientUserId?: string): Promise<{
        request: {
            id: any;
            clientUserId: any;
            title: any;
            description: any;
            category: any;
            budget: number;
            priceType: any;
            address: any;
            status: any;
            createdAt: any;
        } | {
            id: any;
            client_user_id: any;
            title: any;
            description: any;
            category: any;
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
        topOffers: {
            id: any;
            amount: number;
            status: any;
            workerId: any;
            workerName: string;
            averageRating: number;
            completedJobs: number;
        }[];
    }>;
    getOffers(requestId?: string, clientUserId?: string): Promise<{
        request: {
            id: any;
            clientUserId: any;
            title: any;
            description: any;
            category: any;
            budget: number;
            priceType: any;
            address: any;
            status: any;
            createdAt: any;
        } | {
            id: any;
            client_user_id: any;
            title: any;
            description: any;
            category: any;
            budget: number;
            price_type: any;
            address: any;
            status: any;
            location: any;
            created_at: any;
        };
        offers: {
            id: any;
            amount: number;
            status: any;
            message: any;
            worker: {
                id: any;
                firstName: any;
                lastName: any;
                profilePhotoUrl: any;
                averageRating: number;
                completedJobs: number;
                skills: any;
                distanceKm: number | null;
            };
        }[];
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
            skills: any[];
            bio: string;
            gallery: string[];
        };
        reviews: {
            stars: number;
            comment: any;
            createdAt: any;
            clientName: string;
        }[];
    }>;
    getMessages(userId: string): Promise<{
        threads: {
            id: any;
            requestId: any;
            counterpart: {
                id: any;
                firstName: any;
                lastName: any;
                profilePhotoUrl: any;
            };
            lastMessage: any;
            lastMessageAt: any;
        }[];
    }>;
    getThreadMessages(threadId: string): Promise<{
        threadId: string;
        messages: {
            id: any;
            senderUserId: any;
            content: any;
            createdAt: any;
        }[];
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
    } | {
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
            isAvailable: any;
        };
        available: any;
        summary: {
            jobsToday: number;
            earningsToday: number;
            nearbyRequests: number;
        };
        skills: any[];
    }>;
    setWorkerAvailability(workerUserId: string, available: boolean): Promise<{
        workerId: any;
        isAvailable: any;
    }>;
    getWorkerSkills(workerUserId: string): Promise<{
        workerUserId: string;
        skills: any[];
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
