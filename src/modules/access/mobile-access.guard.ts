import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AccessService } from './access.service';

@Injectable()
export class UserAccessGuard implements CanActivate {
  constructor(protected readonly access: AccessService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    req.principal = await this.access.authenticate(req.headers.authorization?.replace(/^Bearer\s+/i, ''));
    if (req.principal.kind !== 'mobile') throw new ForbiddenException();
    return true;
  }
}

@Injectable()
export class AdminAccessGuard implements CanActivate {
  constructor(private readonly access: AccessService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    req.principal = await this.access.authenticate(req.headers.authorization?.replace(/^Bearer\s+/i, ''));
    if (req.principal.kind !== 'admin') throw new ForbiddenException();
    return true;
  }
}

@Injectable()
export class MobileAccessGuard implements CanActivate {
  constructor(private readonly access: AccessService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const name = context.getHandler().name;
    if (['register', 'login', 'googleLogin', 'googleRegister', 'checkIdentifier'].includes(name)) return true;
    const req = context.switchToHttp().getRequest();
    const principal = await this.access.authenticate(req.headers.authorization?.replace(/^Bearer\s+/i, ''));
    req.principal = principal;
    const path = req.route.path as string;
    // All /mobile/admin operations require an actual administrator.
    if (path.includes('/admin/') || name === 'getCommissionConfig' || name === 'getAiConfig') {
      if (principal.kind !== 'admin') throw new ForbiddenException();
      return true;
    }
    if (principal.kind === 'admin' && ['getDisputeMessages', 'sendDisputeMessage'].includes(name)) {
      if (name === 'sendDisputeMessage') { req.body.senderType = 'admin'; req.body.senderId = undefined; }
      return true;
    }
    if (principal.kind === 'admin' && name === 'createCategory') return true;
    if (principal.kind !== 'mobile') throw new ForbiddenException();
    if (name === 'createCategory' && principal.role !== 'worker') throw new ForbiddenException();

    const actorFields = ['userId', 'clientUserId', 'senderUserId', 'reporterUserId', 'reportedBy', 'senderId'];
    if (name !== 'createReview') actorFields.push('workerUserId');
    for (const field of actorFields) {
      for (const source of [req.body, req.query, req.params]) {
        if (source?.[field] && source[field] !== principal.id) throw new ForbiddenException('Identidad ajena');
      }
    }
    if (path.includes('/worker/') && principal.role !== 'worker') throw new ForbiddenException();
    if (['createRequest', 'acceptOffer', 'clientCounterOffer', 'clientConfirmArrival', 'createReview'].includes(name)
        && principal.role !== 'client') throw new ForbiddenException();
    if (['getIncomingRequest', 'upsertOffer', 'discardOffer', 'declineOffer', 'reactivateOffer', 'workerMarkArrived', 'completeJob', 'dismissRequest'].includes(name)
        && principal.role !== 'worker') throw new ForbiddenException();

    if (req.params.threadId) await this.access.assertThread(principal.id, req.params.threadId);
    const requestId = req.query.requestId || req.body?.requestId;
    if (requestId && ['getTracking', 'getRequestStatus', 'getOffers', 'createReview', 'createDispute'].includes(name)) {
      await this.access.assertRequest(principal.id, requestId);
    }
    if (req.params.disputeId) await this.access.assertDispute(principal.id, req.params.disputeId);
    if (name === 'sendDisputeMessage' && (req.body.senderType !== 'user' || req.body.senderId !== principal.id)) throw new ForbiddenException();
    if (name === 'getNotificationRequest') return true;
    if (name === 'getDisputeMessages' && req.query.readBy === 'admin') throw new ForbiddenException();
    // Existing controller arguments remain compatible but are sourced from the authenticated actor.
    const actor = ['createRequest', 'getRequestStatus', 'getOffers', 'getClientHistory', 'acceptOffer', 'clientCounterOffer', 'clientConfirmArrival', 'createReview'].includes(name)
      ? 'clientUserId' : ['sendThreadMessage'].includes(name) ? 'senderUserId' : 'userId';
    if (req.method === 'GET') Object.defineProperty(req, 'query', { value: { ...req.query, [actor]: principal.id }, configurable: true });
    return true;
  }
}
