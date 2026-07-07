import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class AgencyJwtAuthGuard extends AuthGuard('agency-jwt') {}
