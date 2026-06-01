import { PushService } from '../../infrastructure/push/push.service';
import { SendTestPushDto } from './dto/send-test-push.dto';
export declare class NotificationsService {
    private readonly pushService;
    constructor(pushService: PushService);
    isPushEnabled(): boolean;
    sendTestPush(payload: SendTestPushDto): Promise<{
        enabled: boolean;
        messageId: string | null;
    }>;
    notifyWorkersForJobWave(params: {
        tokens: string[];
        jobId: string;
        category: string;
        offeredPrice: string;
        distanceKm: string;
    }): Promise<number>;
    notifyClientNewOffer(params: {
        token: string;
        workerName: string;
        amount: number;
        jobTitle: string;
        requestId: string;
    }): Promise<string | null>;
    notifyWorkerOfferAccepted(params: {
        token: string;
        clientName: string;
        jobTitle: string;
        requestId: string;
    }): Promise<string | null>;
    notifyNewMessage(params: {
        token: string;
        senderName: string;
        message: string;
        threadId: string;
    }): Promise<string | null>;
}
