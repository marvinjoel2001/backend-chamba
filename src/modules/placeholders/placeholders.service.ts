import { Injectable } from '@nestjs/common';

@Injectable()
export class PlaceholdersService {
  listPlannedApiAreas() {
    return [
      {
        area: 'auth',
        status: 'pending',
        notes:
          'Firebase Auth OTP with phone number onboarding for workers and clients.',
      },
      {
        area: 'jobs',
        status: 'pending',
        notes:
          'Job requests, bids, wave notifications, and negotiation lifecycle.',
      },
      {
        area: 'files',
        status: 'pending',
        notes: 'Upload workflow to Cloudflare R2 and metadata persistence.',
      },
      {
        area: 'tracking',
        status: 'pending',
        notes:
          'Live worker location streaming (1 hour before job start) via Socket.io.',
      },
    ];
  }
}
