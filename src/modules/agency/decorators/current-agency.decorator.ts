import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AgencyPrincipal } from '../strategies/agency-jwt.strategy';

export const CurrentAgency = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AgencyPrincipal => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AgencyPrincipal;
  },
);
