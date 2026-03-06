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
}
