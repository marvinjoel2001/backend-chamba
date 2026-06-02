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
    sendTestPush(payload: SendTestPushDto): Promise<{
        enabled: boolean;
        messageId: string | null;
    }>;
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
    getUserNotifications(userId: string): Promise<Notification[]>;
    markNotificationsAsRead(userId: string): Promise<void>;
}
