import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MobileRequestRepository } from './shared/mobile-request.repository';
import { MobileGeoHelpers } from './shared/mobile-geo.helpers';
import { MobileCatalogService } from './services/mobile-catalog.service';
import { MobileChatService } from './services/mobile-chat.service';
import { MobileDisputesService } from './services/mobile-disputes.service';
import { MobileOffersService } from './services/mobile-offers.service';
import { MobileRequestsService } from './services/mobile-requests.service';
import { MobileUsersService } from './services/mobile-users.service';
import { MobileAdminService } from './services/mobile-admin.service';
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
    paymentMethod?: string;
    modality?: string;
    estimatedHours?: number;
    hourlyRate?: number;
    days?: number;
    dailyRate?: number;
    startDate?: string;
};
export declare class MobileService implements OnModuleInit {
    private readonly configService;
    private readonly dataSource;
    private readonly storageService;
    private readonly notificationsService;
    private readonly realtimeGateway;
    private readonly repo;
    private readonly geoHelpers;
    private readonly catalogService;
    private readonly chatService;
    private readonly disputesService;
    private readonly offersService;
    private readonly requestsService;
    private readonly usersService;
    private readonly adminService;
    private readonly logger;
    private static readonly OFFER_LIFETIME_SECONDS;
    private static readonly OFFER_LIFETIME_CONFIG_KEY;
    private static readonly WORKER_NOTIFICATION_RADIUS_CONFIG_KEY;
    private static readonly WORKER_NOTIFICATION_WAVE_SIZE;
    private static readonly WORKER_NOTIFICATION_WAVE_DELAY_MS;
    private static readonly DEFAULT_CATEGORY;
    private static readonly GEMINI_TIMEOUT_MS;
    constructor(configService: ConfigService, dataSource: DataSource, storageService: StorageService, notificationsService: NotificationsService, realtimeGateway: RealtimeGateway, repo: MobileRequestRepository, geoHelpers: MobileGeoHelpers, catalogService: MobileCatalogService, chatService: MobileChatService, disputesService: MobileDisputesService, offersService: MobileOffersService, requestsService: MobileRequestsService, usersService: MobileUsersService, adminService: MobileAdminService);
    onModuleInit(): Promise<void>;
    register(input: {
        type?: string;
        email: string;
        phone?: string;
        firstName: string;
        lastName?: string;
        password: string;
        ciNumber?: string;
    }): Promise<{
        user: {
            id: any;
            type: any;
            firstName: any;
            lastName: any;
            email: any;
            phone: any;
            profilePhotoUrl: any;
            verificationStatus: any;
            idPhotoUrl: any;
            facePhotoUrl: any;
            idPhotoVerified: any;
            facePhotoVerified: any;
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
            verificationStatus: any;
            idPhotoUrl: any;
            facePhotoUrl: any;
            idPhotoVerified: any;
            facePhotoVerified: any;
            isBlocked: any;
            isAgencyWorker: any;
            agencyId: any;
        };
        token: string;
    }>;
    private verifyGoogleToken;
    googleLogin(idToken: string): Promise<{
        requiresRegistration: boolean;
        googleData: {
            email: string;
            firstName: string;
            lastName: string;
            googleId: string;
        };
        user?: undefined;
        token?: undefined;
    } | {
        user: {
            id: any;
            type: any;
            firstName: any;
            lastName: any;
            email: any;
            phone: any;
            profilePhotoUrl: any;
            verificationStatus: any;
            idPhotoUrl: any;
            facePhotoUrl: any;
            idPhotoVerified: any;
            facePhotoVerified: any;
            isBlocked: any;
        };
        token: string;
        requiresRegistration?: undefined;
        googleData?: undefined;
    }>;
    googleRegister(params: {
        email: string;
        firstName: string;
        lastName?: string;
        googleId: string;
        type: 'worker' | 'client';
    }): Promise<{
        user: {
            id: any;
            type: any;
            firstName: any;
            lastName: any;
            email: any;
            phone: any;
            profilePhotoUrl: any;
            verificationStatus: any;
            idPhotoUrl: any;
            facePhotoUrl: any;
            idPhotoVerified: any;
            facePhotoVerified: any;
            isBlocked: any;
        };
        token: string;
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
            verificationStatus: any;
            idPhotoUrl: any;
            facePhotoUrl: any;
            idPhotoVerified: any;
            facePhotoVerified: any;
            verificationReviewedAt: any;
            isAvailable: any;
            isAgencyWorker: any;
            agencyId: any;
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
            modality: any;
            estimatedHours: number | null;
            hourlyRate: number | null;
            days: number | null;
            dailyRate: number | null;
            startDate: any;
            pendingOffersCount: number;
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
            verificationStatus: any;
            idPhotoUrl: any;
            facePhotoUrl: any;
            idPhotoVerified: any;
            facePhotoVerified: any;
            verificationReviewedAt: any;
            isAvailable: any;
            isAgencyWorker: any;
            agencyId: any;
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
            verificationStatus: any;
            idPhotoUrl: any;
            facePhotoUrl: any;
            idPhotoVerified: any;
            facePhotoVerified: any;
            verificationReviewedAt: any;
            isAvailable: any;
            isAgencyWorker: any;
            agencyId: any;
            workRadiusKm: number;
            currentLatitude: number | null;
            currentLongitude: number | null;
        };
    }>;
    submitWorkerVerification(params: {
        workerUserId: string;
        idPhotoBase64: string;
        facePhotoBase64: string;
    }): Promise<{
        submitted: boolean;
        user: {
            id: any;
            type: any;
            firstName: any;
            lastName: any;
            email: any;
            phone: any;
            profilePhotoUrl: any;
            profilePhotoPublicId: any;
            verificationStatus: any;
            idPhotoUrl: any;
            facePhotoUrl: any;
            idPhotoVerified: any;
            facePhotoVerified: any;
            verificationReviewedAt: any;
            isAvailable: any;
            isAgencyWorker: any;
            agencyId: any;
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
            modality: any;
            estimatedHours: number | null;
            hourlyRate: number | null;
            days: number | null;
            dailyRate: number | null;
            startDate: any;
        } | {
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
            modality: any;
            estimatedHours: number | null;
            hourlyRate: number | null;
            days: number | null;
            dailyRate: number | null;
            startDate: any;
            pendingOffersCount: number;
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
            agencyName: any;
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
            modality: any;
            estimatedHours: number | null;
            hourlyRate: number | null;
            days: number | null;
            dailyRate: number | null;
            startDate: any;
        } | {
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
            modality: any;
            estimatedHours: number | null;
            hourlyRate: number | null;
            days: number | null;
            dailyRate: number | null;
            startDate: any;
            pendingOffersCount: number;
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
            agencyName: any;
        }[];
        nearbyWorkers: {
            id: string;
            firstName: string;
            profilePhotoUrl: string | null;
            latitude: number;
            longitude: number;
            distanceKm: number;
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
            modalities: any;
            hourlyRate: number | null;
            dailyRate: number | null;
            skills: any[];
            bio: null;
            verificationStatus: any;
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
            request: {
                id: any;
                title: any;
                description: any;
                status: any;
                budget: any;
                category: any;
                workerId: any;
                clientId: any;
            } | null;
            counterpart: {
                id: any;
                firstName: any;
                lastName: any;
                profilePhotoUrl: any;
                phone: any;
            };
            lastMessage: any;
            lastMessageAt: any;
            unreadCount: any;
            hasUnreadMessages: boolean;
        }[];
    }>;
    getThreadMessages(threadId: string, opts?: {
        limit?: number;
        before?: string;
    }): Promise<{
        threadId: string;
        hasMore: boolean;
        messages: {
            id: any;
            senderUserId: any;
            content: any;
            createdAt: any;
        }[];
    }>;
    archiveThread(params: {
        threadId: string;
        userId: string;
    }): Promise<{
        success: boolean;
    }>;
    markThreadRead(threadId: string, userId: string): Promise<{
        ok: boolean;
    }>;
    broadcastNotification(payload: {
        target: 'all' | 'workers' | 'clients' | 'custom';
        type: 'push' | 'toast';
        title: string;
        body: string;
        toastType?: 'info' | 'success' | 'error';
        userIds?: string[];
    }): Promise<{
        success: boolean;
        method: string;
        count?: undefined;
    } | {
        success: boolean;
        method: string;
        count: number;
    }>;
    getPushUsers(): Promise<any[]>;
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
        requests: never[];
        offerLifetimeSeconds?: undefined;
        request?: undefined;
    } | {
        offerLifetimeSeconds: number;
        request: {
            id: any;
            title: any;
            description: any;
            category: any;
            budget: number;
            priceType: any;
            modality: any;
            estimatedHours: number | null;
            hourlyRate: number | null;
            days: number | null;
            dailyRate: number | null;
            startDate: any;
            address: any;
            status: any;
            photos: any;
            distanceKm: number | null;
            client: {
                id: any;
                name: string;
                profilePhotoUrl: any;
                rating: number;
                reviews: number;
                isVerified: boolean;
            };
            workerOffer: {
                id: any;
                amount: number;
                status: any;
                expiresAt: any;
                secondsRemaining: number | null;
            } | null;
            offerLifetimeSeconds: number;
        } | null;
        requests: {
            id: any;
            title: any;
            description: any;
            category: any;
            budget: number;
            priceType: any;
            modality: any;
            estimatedHours: number | null;
            hourlyRate: number | null;
            days: number | null;
            dailyRate: number | null;
            startDate: any;
            address: any;
            status: any;
            photos: any;
            distanceKm: number | null;
            client: {
                id: any;
                name: string;
                profilePhotoUrl: any;
                rating: number;
                reviews: number;
                isVerified: boolean;
            };
            workerOffer: {
                id: any;
                amount: number;
                status: any;
                expiresAt: any;
                secondsRemaining: number | null;
            } | null;
            offerLifetimeSeconds: number;
        }[];
    }>;
    blockUser(blockerUserId: string, blockedUserId: string): Promise<{
        success: boolean;
    }>;
    reportRequest(requestId: string, reporterUserId: string, reason: string): Promise<{
        success: boolean;
    }>;
    dismissRequest(requestId: string, workerUserId: string): Promise<{
        success: boolean;
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
    discardOffer(params: {
        requestId: string;
        workerUserId: string;
    }): Promise<{
        discarded: boolean;
        requestId: string;
    }>;
    declineOffer(params: {
        requestId: string;
        workerUserId: string;
    }): Promise<{
        declined: boolean;
        requestId: string;
    }>;
    reactivateOffer(params: {
        requestId: string;
        workerUserId: string;
    }): Promise<{
        reactivated: boolean;
        requestId: string;
    }>;
    clientCounterOffer(params: {
        requestId: string;
        clientUserId: string;
        amount: number;
    }): Promise<{
        requestId: string;
        newBudget: number;
    }>;
    getTracking(requestId: string): Promise<{
        requestId: any;
        title: any;
        address: any;
        status: any;
        priceType: any;
        modality: any;
        estimatedHours: number | null;
        hourlyRate: number | null;
        days: number | null;
        dailyRate: number | null;
        startDate: any;
        workerArrived: any;
        clientConfirmedArrival: any;
        completedAt: any;
        workStartedAt: any;
        workElapsedSeconds: number | null;
        distanceKm: number | null;
        etaMinutes: number | null;
        agreedAmount: number;
        destination: {
            latitude: number | null;
            longitude: number | null;
        };
        worker: {
            id: any;
            firstName: any;
            lastName: any;
            profilePhotoUrl: any;
            latitude: number | null;
            longitude: number | null;
        };
        client: {
            id: any;
            firstName: any;
            lastName: any;
            profilePhotoUrl: any;
        };
    }>;
    workerMarkArrived(params: {
        requestId: string;
        workerUserId: string;
    }): Promise<{
        requestId: string;
        workerArrived: boolean;
    }>;
    clientConfirmArrival(params: {
        requestId: string;
        clientUserId: string;
    }): Promise<{
        requestId: string;
        clientConfirmedArrival: boolean;
    }>;
    completeJob(params: {
        requestId: string;
        workerUserId: string;
    }): Promise<{
        requestId: string;
        status: string;
    }>;
    cancelJob(params: {
        requestId: string;
        userId: string;
    }): Promise<{
        requestId: string;
        status: string;
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
            verificationStatus: any;
            idPhotoUrl: any;
            facePhotoUrl: any;
            idPhotoVerified: any;
            facePhotoVerified: any;
            verificationReviewedAt: any;
            isAvailable: any;
            isAgencyWorker: any;
            agencyId: any;
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
    getAdminMapSnapshot(params: {
        since?: string;
    }): Promise<{
        serverTime: string;
        workers: {
            id: any;
            firstName: any;
            lastName: any;
            isAvailable: any;
            averageRating: number;
            completedJobs: number;
            latitude: number;
            longitude: number;
            updatedAt: any;
            activeRequest: {
                id: any;
                title: any;
                status: any;
                address: any;
                workerArrived: any;
                clientName: string;
            } | null;
        }[];
        clients: {
            id: any;
            firstName: any;
            lastName: any;
            latitude: number;
            longitude: number;
            updatedAt: any;
        }[];
        requests: {
            id: any;
            title: any;
            status: any;
            budget: number;
            address: any;
            clientName: string;
            latitude: number;
            longitude: number;
            updatedAt: any;
            createdAt: any;
            photoUrl: any;
            cancelledBy: string | null;
        }[];
    }>;
    getAdminWallet(params: {
        period?: 'day' | 'week' | 'month';
    }): Promise<{
        period: "day" | "week" | "month";
        totals: any;
        workers: {
            id: any;
            name: string;
            jobsCompleted: number;
            earnings: number;
        }[];
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
        timestamp: string;
    }>;
    updateClientLocation(params: {
        clientUserId: string;
        latitude: number;
        longitude: number;
    }): Promise<{
        clientId: any;
        latitude: number;
        longitude: number;
        timestamp: string;
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
    getWorkerModalities(workerUserId: string): Promise<{
        workerUserId: string;
        modalities: any;
        hourlyRate: number | null;
        dailyRate: number | null;
    }>;
    updateWorkerModalities(workerUserId: string, input: {
        modalities?: string[];
        hourlyRate?: number | null;
        dailyRate?: number | null;
    }): Promise<{
        workerUserId: string;
        modalities: string[];
        hourlyRate: number | null;
        dailyRate: number | null;
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
            offerStatus: any;
            requestStatus: any;
            acceptedAt: any;
            threadId: any;
            photoUrl: any;
            client: {
                id: any;
                firstName: any;
                lastName: any;
                profilePhotoUrl: any;
            };
        }[];
    }>;
    getClientHistory(clientUserId: string): Promise<{
        clientUserId: string;
        jobs: {
            requestId: any;
            title: any;
            description: any;
            category: any;
            address: any;
            amount: number | null;
            offerId: any;
            offerStatus: any;
            requestStatus: any;
            createdAt: any;
            threadId: any;
            photoUrl: any;
            worker: {
                id: any;
                firstName: any;
                lastName: any;
                profilePhotoUrl: any;
            } | null;
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
        alreadyReviewed: boolean;
        workerUserId?: undefined;
        averageRating?: undefined;
        completedJobs?: undefined;
    } | {
        saved: boolean;
        workerUserId: string;
        averageRating: number;
        completedJobs: number;
        alreadyReviewed?: undefined;
    }>;
    private ensureSchema;
    private seedData;
    private seedDefaultCategories;
    private seedDefaultConfig;
    getAdminWorkerNotificationSettings(): Promise<{
        radiusKm: number;
    }>;
    updateAdminWorkerNotificationSettings(params: {
        radiusKm: number;
    }): Promise<{
        radiusKm: number;
    }>;
    getOfferLifetimeSettings(): Promise<{
        fixed: number;
        hour: number;
        day: number;
        defaults: {
            fixed: number;
            hour: number;
            day: number;
        };
    }>;
    updateOfferLifetimeSettings(params: {
        fixed: number;
        hour: number;
        day: number;
    }): Promise<Record<string, number>>;
    getRequestTimeoutSettings(): Promise<Record<"fixed" | "hour" | "day", {
        timeoutMinutes: number;
        reminder1Minutes: number;
        reminder2Minutes: number;
    }>>;
    updateRequestTimeoutSettings(params: Record<string, {
        timeoutMinutes?: number;
        reminder1Minutes?: number;
        reminder2Minutes?: number;
    }>): Promise<Record<"fixed" | "hour" | "day", {
        timeoutMinutes: number;
        reminder1Minutes: number;
        reminder2Minutes: number;
    }>>;
    getRequestNotifiedWorkers(requestId: string): Promise<{
        requestId: string;
        total: number;
        workers: {
            id: any;
            firstName: any;
            lastName: any;
            profilePhotoUrl: any;
            phone: any;
            averageRating: number;
            completedJobs: number;
            notifiedAt: any;
            offerStatus: any;
            offerAmount: number | null;
        }[];
    }>;
    listDisputes(params?: {
        status?: string;
    }): Promise<{
        disputes: {
            id: any;
            requestId: any;
            requestTitle: any;
            requestStatus: any;
            reportedBy: any;
            reporterName: string;
            reporterType: any;
            reportedUser: any;
            reportedName: string;
            reportedType: any;
            reason: any;
            description: any;
            status: any;
            resolution: any;
            resolvedBy: any;
            resolvedAt: any;
            createdAt: any;
            updatedAt: any;
        }[];
    }>;
    createDispute(params: {
        requestId?: string;
        reportedBy: string;
        reportedUser?: string;
        reason: string;
        description?: string;
    }): Promise<{
        dispute: {
            id: any;
            status: any;
            createdAt: any;
        };
    }>;
    resolveDispute(params: {
        disputeId: string;
        resolution: string;
        resolvedBy: string;
    }): Promise<{
        disputeId: string;
        status: string;
    }>;
    adminCancelJob(params: {
        requestId: string;
    }): Promise<{
        requestId: string;
        status: string;
    }>;
    getCancellationStats(): Promise<{
        users: {
            id: any;
            name: string;
            type: any;
            cancelCount: any;
        }[];
    }>;
    getCommissionConfig(): Promise<{
        commissionPercent: number;
    }>;
    updateCommissionConfig(params: {
        commissionPercent: number;
    }): Promise<{
        commissionPercent: number;
    }>;
    getAiConfig(): Promise<any>;
    testAiMessage(message: string): Promise<{
        ok: boolean;
        response?: string;
        model?: string;
        provider?: string;
        durationMs?: number;
        error?: string;
    }>;
    checkAiStatus(): Promise<{
        nvidia: {
            ok: boolean;
            model?: string;
            durationMs?: number;
            error?: string;
        };
        gemini: {
            ok: boolean;
            durationMs?: number;
            error?: string;
        };
        deepseek: {
            ok: boolean;
            durationMs?: number;
            error?: string;
        };
    }>;
    updateAiConfig(params: {
        activeProvider: string;
        geminiKey: string;
        nvidiaKey: string;
        nvidiaModel: string;
        deepseekKey: string;
    }): Promise<{
        activeProvider: string;
        geminiKey: string;
        nvidiaKey: string;
        nvidiaModel: string;
        deepseekKey: string;
    }>;
    updateCategory(params: {
        id: string;
        name?: string;
        description?: string;
        icon?: string;
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
    getDisputeMessages(disputeId: string, readBy?: string): Promise<{
        messages: {
            id: any;
            disputeId: any;
            senderType: any;
            senderId: any;
            senderName: string;
            content: any;
            createdAt: any;
        }[];
    }>;
    getUserActiveDisputes(userId: string): Promise<{
        disputes: {
            id: any;
            requestId: any;
            requestTitle: any;
            reportedBy: any;
            reportedUser: any;
            reason: any;
            description: any;
            status: any;
            resolution: any;
            resolvedBy: any;
            resolvedAt: any;
            createdAt: any;
            updatedAt: any;
            unreadCount: any;
        }[];
    }>;
    sendDisputeMessage(params: {
        disputeId: string;
        senderType: string;
        senderId?: string;
        content: string;
    }): Promise<{
        messageId: any;
        createdAt: any;
    }>;
    deleteCategory(categoryId: string): Promise<{
        deleted: boolean;
        categoryId: string;
    }>;
    listAllCategories(): Promise<{
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
    getUserDisputes(userId: string): Promise<{
        made: {
            id: any;
            requestId: any;
            requestTitle: any;
            reason: any;
            description: any;
            status: any;
            resolution: any;
            resolvedBy: any;
            resolvedAt: any;
            createdAt: any;
            reporterName: string;
            reporterType: any;
            reportedName: string;
            reportedType: any;
        }[];
        received: {
            id: any;
            requestId: any;
            requestTitle: any;
            reason: any;
            description: any;
            status: any;
            resolution: any;
            resolvedBy: any;
            resolvedAt: any;
            createdAt: any;
            reporterName: string;
            reporterType: any;
            reportedName: string;
            reportedType: any;
        }[];
    }>;
}
export {};
