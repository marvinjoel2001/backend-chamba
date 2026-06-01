import { MobileService } from './mobile.service';
export declare class MobileController {
    private readonly mobileService;
    constructor(mobileService: MobileService);
    register(type: string, email: string, phone: string | undefined, firstName: string, lastName: string | undefined, password: string): Promise<{
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
            verificationStatus: any;
            idPhotoUrl: any;
            facePhotoUrl: any;
            idPhotoVerified: any;
            facePhotoVerified: any;
            verificationReviewedAt: any;
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
    previewRequestCategories(title: string | undefined, description: string, category: string | undefined): Promise<{
        title: string;
        category: string;
        aiCategories: {
            id: string;
            name: string;
            confidence: number;
        }[];
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
    }>, paymentMethod?: string): Promise<{
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
    getCategories(): Promise<{
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
            verificationStatus: any;
            idPhotoUrl: any;
            facePhotoUrl: any;
            idPhotoVerified: any;
            facePhotoVerified: any;
            verificationReviewedAt: any;
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
            verificationStatus: any;
            idPhotoUrl: any;
            facePhotoUrl: any;
            idPhotoVerified: any;
            facePhotoVerified: any;
            verificationReviewedAt: any;
            isAvailable: any;
            workRadiusKm: number;
            currentLatitude: number | null;
            currentLongitude: number | null;
        };
    }>;
    submitWorkerVerification(workerUserId: string, idPhotoBase64: string, facePhotoBase64: string): Promise<{
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
            pendingOffersCount: number;
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
    getOffers(requestId?: string, clientUserId?: string): Promise<{
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
            pendingOffersCount: number;
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
            priceType: any;
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
    discardOffer(requestId: string, workerUserId: string): Promise<{
        discarded: boolean;
        requestId: string;
    }>;
    declineOffer(requestId: string, workerUserId: string): Promise<{
        declined: boolean;
        requestId: string;
    }>;
    reactivateOffer(requestId: string, workerUserId: string): Promise<{
        reactivated: boolean;
        requestId: string;
    }>;
    clientCounterOffer(requestId: string, clientUserId: string, amount: number): Promise<{
        requestId: string;
        newBudget: number;
    }>;
    getTracking(requestId: string): Promise<{
        requestId: any;
        title: any;
        address: any;
        status: any;
        priceType: any;
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
    workerMarkArrived(requestId: string, workerUserId: string): Promise<{
        requestId: string;
        workerArrived: boolean;
    }>;
    clientConfirmArrival(requestId: string, clientUserId: string): Promise<{
        requestId: string;
        clientConfirmedArrival: boolean;
    }>;
    completeJob(requestId: string, workerUserId: string): Promise<{
        requestId: string;
        status: string;
    }>;
    cancelJob(requestId: string, userId: string): Promise<{
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
    getAdminMapSnapshot(since?: string): Promise<{
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
        }[];
    }>;
    getAdminWallet(period?: string): Promise<{
        period: "day" | "week" | "month";
        totals: any;
        workers: {
            id: any;
            name: string;
            jobsCompleted: number;
            earnings: number;
        }[];
    }>;
    getAdminWorkerNotificationSettings(): Promise<{
        radiusKm: number;
    }>;
    updateAdminWorkerNotificationSettings(radiusKm: number): Promise<{
        radiusKm: number;
    }>;
    setWorkerAvailability(workerUserId: string, available: boolean): Promise<{
        workerId: any;
        isAvailable: any;
    }>;
    updateWorkerLocation(workerUserId: string, latitude: number, longitude: number): Promise<{
        workerId: any;
        latitude: number;
        longitude: number;
        timestamp: string;
    }>;
    getWorkerSkills(workerUserId: string): Promise<{
        workerUserId: string;
        skills: any[];
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
            client: {
                id: any;
                firstName: any;
                lastName: any;
                profilePhotoUrl: any;
            };
        }[];
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
    listDisputes(status?: string): Promise<{
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
    createDispute(requestId: string | undefined, reportedBy: string, reportedUser?: string, reason?: string, description?: string): Promise<{
        dispute: {
            id: any;
            status: any;
            createdAt: any;
        };
    }>;
    resolveDispute(disputeId: string, resolution: string, resolvedBy?: string): Promise<{
        disputeId: string;
        status: string;
    }>;
    getDisputeMessages(disputeId: string): Promise<{
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
    sendDisputeMessage(disputeId: string, senderType: string, senderId?: string, content?: string): Promise<{
        messageId: any;
        createdAt: any;
    }>;
    adminCancelJob(requestId: string): Promise<{
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
    updateCommissionConfig(commissionPercent: number): Promise<{
        commissionPercent: number;
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
    updateCategory(categoryId: string, name?: string, description?: string, icon?: string, active?: boolean): Promise<{
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
    deleteCategory(categoryId: string): Promise<{
        deleted: boolean;
        categoryId: string;
    }>;
}
