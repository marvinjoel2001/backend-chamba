import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
type CreateRequestInput = {
    clientUserId: string;
    title: string;
    description: string;
    category?: string;
    aiCategories?: Array<{
        id: string;
        name: string;
        confidence: number;
    }>;
    budget: number;
    priceType: string;
    address: string;
    latitude: number;
    longitude: number;
    scheduledAt?: string;
    photosBase64?: string[];
    photos?: Array<{
        url: string;
        publicId: string;
    }>;
};
export declare class MobileService implements OnModuleInit {
    private readonly configService;
    private readonly dataSource;
    private readonly storageService;
    private readonly notificationsService;
    private readonly realtimeGateway;
    private static readonly OFFER_LIFETIME_SECONDS;
    private static readonly DEFAULT_CATEGORY;
    private static readonly GEMINI_TIMEOUT_MS;
    constructor(configService: ConfigService, dataSource: DataSource, storageService: StorageService, notificationsService: NotificationsService, realtimeGateway: RealtimeGateway);
    onModuleInit(): Promise<void>;
    register(input: {
        type?: string;
        email: string;
        phone?: string;
        firstName: string;
        lastName?: string;
        password: string;
    }): Promise<{
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
    getExploreData(params: {
        userId: string;
        latitude?: number;
        longitude?: number;
        radiusKm?: number;
    }): Promise<{
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
        categories: string[];
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
    previewRequestCategories(input: {
        title?: string;
        description: string;
        category?: string;
    }): Promise<{
        title: string;
        category: string;
        aiCategories: {
            id: string;
            name: string;
            confidence: number;
        }[];
    }>;
    createRequest(input: CreateRequestInput): Promise<{
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
        notifiedWorkers: number;
    }>;
    uploadProfilePhoto(params: {
        userId: string;
        imageBase64?: string;
        imageUrl?: string;
        imagePublicId?: string;
    }): Promise<{
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
    deleteRequestPhoto(params: {
        requestPhotoId: string;
        clientUserId: string;
    }): Promise<{
        deleted: boolean;
        requestPhotoId: string;
        requestId: any;
    }>;
    upsertPushToken(params: {
        userId: string;
        token: string;
        platform?: string;
    }): Promise<{
        pushToken: any;
    }>;
    getRequestStatus(params: {
        requestId?: string;
        clientUserId?: string;
    }): Promise<{
        request: {
            photos: {
                id: any;
                url: any;
                createdAt: any;
            }[];
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
            photos: {
                id: any;
                url: any;
                createdAt: any;
            }[];
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
    getOffers(params: {
        requestId?: string;
        clientUserId?: string;
    }): Promise<{
        request: {
            photos: {
                id: any;
                url: any;
                createdAt: any;
            }[];
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
            photos: {
                id: any;
                url: any;
                createdAt: any;
            }[];
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
        offers: {
            id: any;
            amount: number;
            status: any;
            expiresAt: any;
            secondsRemaining: number | null;
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
            skills: any[];
            bio: string;
            gallery: any[];
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
    sendMessage(params: {
        threadId: string;
        senderUserId: string;
        content: string;
    }): Promise<{
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
    upsertOffer(params: {
        requestId: string;
        workerUserId: string;
        amount: number;
        message?: string;
    }): Promise<{
        offer: {
            id: string;
            requestId: string;
            workerUserId: string;
            amount: number;
            message: string;
            status: string;
        };
    }>;
    acceptOffer(params: {
        offerId: string;
        clientUserId: string;
    }): Promise<{
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
        skills: any[];
    }>;
    setWorkerAvailability(workerUserId: string, available: boolean): Promise<{
        workerId: any;
        isAvailable: any;
    }>;
    updateWorkerLocation(params: {
        workerUserId: string;
        latitude: number;
        longitude: number;
    }): Promise<{
        workerId: any;
        latitude: number;
        longitude: number;
    }>;
    getWorkerSkills(workerUserId: string): Promise<{
        workerUserId: string;
        skills: any[];
    }>;
    listCategories(): Promise<{
        categories: {
            id: any;
            name: any;
            description: any;
            icon: any;
            parentId: any;
            active: any;
            createdAt: any;
            updatedAt: any;
        }[];
    }>;
    createCategory(input: {
        id?: string;
        name: string;
        description?: string;
        icon?: string;
        parentId?: string;
        active?: boolean;
    }): Promise<{
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
    updateWorkerSkills(workerUserId: string, skills: string[]): Promise<{
        workerUserId: string;
        skills: string[];
    }>;
    getWorkerHistory(workerUserId: string): Promise<{
        workerUserId: string;
        jobs: {
            offerId: any;
            requestId: any;
            title: any;
            description: any;
            category: any;
            address: any;
            amount: number;
            status: any;
            acceptedAt: any;
            threadId: any;
            client: {
                id: any;
                firstName: any;
                lastName: any;
                profilePhotoUrl: any;
            };
        }[];
    }>;
    createReview(params: {
        requestId: string;
        workerUserId: string;
        clientUserId: string;
        stars: number;
        comment?: string;
    }): Promise<{
        saved: boolean;
        workerUserId: string;
        averageRating: number;
        completedJobs: number;
    }>;
    private ensureSchema;
    private seedData;
    private seedDefaultCategories;
    private extractTopCategories;
    private listFallbackCategories;
    private resolveRequest;
    private findLatestClientRequest;
    private getRequestById;
    private getUserById;
    private getUserByIdWithPhotoMeta;
    private normalizePhone;
    private buildRequestTitle;
    private normalizeAiCategories;
    private parseAiCategories;
    private classifyRequestCategoriesWithAi;
    private parseAiCategoriesFromGeminiText;
    private listActiveCategoryCatalogForAi;
    private toCategoryId;
    private validateBase64Images;
    private ensureDataUri;
    private validateUploadedImages;
    private ensureSecureImageUrl;
    private uploadRequestPhotos;
    private persistUploadedRequestPhotos;
    private getRequestPhotos;
    private ensureThreadExists;
    private ensureThreadAndInitialMessage;
    private seedOffersForRequest;
    private expireStaleOffers;
    private ensureCategoriesExist;
}
export {};
