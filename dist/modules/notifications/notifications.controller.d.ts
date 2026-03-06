import { SendTestPushDto } from './dto/send-test-push.dto';
import { NotificationsService } from './notifications.service';
export declare class NotificationsController {
    private readonly notificationsService;
    constructor(notificationsService: NotificationsService);
    status(): {
        provider: string;
        enabled: boolean;
        note: string;
    };
    sendTestPush(payload: SendTestPushDto): Promise<{
        enabled: boolean;
        messageId: string | null;
    }>;
}
