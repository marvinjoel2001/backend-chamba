import { Repository } from 'typeorm';
import { PushService } from '../../infrastructure/push/push.service';
import { SendTestPushDto } from './dto/send-test-push.dto';
import { Notification } from './entities/notification.entity';
export declare class NotificationsService {
    private readonly pushService;
    private readonly notificationRepository;
    private readonly logger;
    constructor(pushService: PushService, notificationRepository: Repository<Notification>);
    isPushEnabled(): boolean;
    getProjectId(): string | null;
    sendTestPush(payload: SendTestPushDto): Promise<{
        enabled: boolean;
        messageId: string | null;
    }>;
    broadcastPush(params: {
        tokens: string[];
        title: string;
        body: string;
    }): Promise<number>;
    notifyWorkersForJobWave(params: {
        users: {
            userId: string;
            token: string;
        }[];
        jobId: string;
        category: string;
        offeredPrice: string;
        distanceKm: string;
    }): Promise<number>;
    notifyClientNewOffer(params: {
        userId: string;
        token: string;
        workerName: string;
        amount: number;
        jobTitle: string;
        requestId: string;
    }): Promise<string | null>;
    notifyWorkerOfferAccepted(params: {
        userId: string;
        token: string;
        clientName: string;
        jobTitle: string;
        requestId: string;
    }): Promise<string | null>;
    notifyNewMessage(params: {
        userId: string;
        token: string;
        senderName: string;
        message: string;
        threadId: string;
    }): Promise<string | null>;
    notifyWorkerArrived(params: {
        userId: string;
        token: string;
        workerName: string;
        jobTitle: string;
        requestId: string;
    }): Promise<string | null>;
    notifyJobFinished(params: {
        userId: string;
        token: string;
        workerName: string;
        jobTitle: string;
        requestId: string;
    }): Promise<string | null>;
    notifyJobCancelled(params: {
        userId: string;
        token: string | null;
        cancelerName: string;
        jobTitle: string;
        requestId: string;
    }): Promise<string | null>;
    notifySupportMessage(params: {
        userId: string;
        token: string | null;
        message: string;
    }): Promise<string | null>;
    notifyVerificationUpdated(params: {
        userId: string;
        token: string | null;
        status: 'verified' | 'rejected';
        message: string;
    }): Promise<string | null>;
    notifyWorkerCounterOffer(params: {
        userId: string;
        token: string | null;
        clientName: string;
        newAmount: number;
        jobTitle: string;
        requestId: string;
    }): Promise<string | null>;
    notifyOfferRejected(params: {
        userId: string;
        token: string | null;
        jobTitle: string;
        requestId: string;
    }): Promise<string | null>;
    notifyNewReview(params: {
        userId: string;
        token: string | null;
        clientName: string;
        stars: number;
        jobTitle: string;
        requestId: string;
    }): Promise<string | null>;
    notifyClientConfirmedArrival(params: {
        userId: string;
        token: string | null;
        clientName: string;
        jobTitle: string;
        requestId: string;
    }): Promise<string | null>;
    notifyDisputeResolved(params: {
        userId: string;
        token: string | null;
        resolution: string;
        disputeId: string;
    }): Promise<string | null>;
    notifyDisputeCreated(params: {
        userId: string;
        token: string | null;
        reason: string;
        disputeId: string;
    }): Promise<string | null>;
    getUserNotifications(userId: string, page?: number, limit?: number): Promise<{
        items: Notification[];
        hasMore: boolean;
    }>;
    markNotificationsAsRead(userId: string): Promise<void>;
}
