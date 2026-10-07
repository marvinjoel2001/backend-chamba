require('reflect-metadata');
const assert = require('node:assert/strict');
const { Global, Module } = require('@nestjs/common');
const { ConfigService } = require('@nestjs/config');
const { Test } = require('@nestjs/testing');
const { DataSource } = require('typeorm');
const { MobileModule } = require('../dist/modules/mobile/mobile.module');
const {
  MobileChatService,
} = require('../dist/modules/mobile/services/mobile-chat.service');
const {
  JobChatPhotoService,
} = require('../dist/modules/mobile/services/job-chat-photo.service');
const { AccessService } = require('../dist/modules/access/access.service');
const {
  StorageService,
} = require('../dist/infrastructure/storage/storage.service');
const {
  NotificationsService,
} = require('../dist/modules/notifications/notifications.service');
const {
  RealtimeGateway,
} = require('../dist/modules/realtime/realtime.gateway');
const { QueuesService } = require('../dist/modules/queues/queues.service');
const {
  WaveDispatchQueueService,
} = require('../dist/modules/queues/wave-dispatch.queue.service');
const { ApiLogsService } = require('../dist/modules/api-logs/api-logs.service');

// Resolve real compiled mobile providers without database, Redis or network access.
const externalTokens = [
  DataSource,
  AccessService,
  StorageService,
  NotificationsService,
  RealtimeGateway,
  QueuesService,
  WaveDispatchQueueService,
  ApiLogsService,
];
class BuildInfrastructureModule {}
Global()(BuildInfrastructureModule);
Module({
  providers: [
    { provide: ConfigService, useValue: new ConfigService() },
    ...externalTokens.map((provide) => ({ provide, useValue: {} })),
  ],
  exports: [ConfigService, ...externalTokens],
})(BuildInfrastructureModule);

async function check() {
  const builder = Test.createTestingModule({
    imports: [BuildInfrastructureModule, MobileModule],
  });
  for (const imported of Reflect.getMetadata('imports', MobileModule)) {
    builder.overrideModule(imported).useModule(BuildInfrastructureModule);
  }
  const context = await builder.compile();
  try {
    const chat = context.get(MobileChatService);
    assert.ok(context.get(JobChatPhotoService) instanceof JobChatPhotoService);
    assert.equal(chat.photoPolicy, context.get(JobChatPhotoService));
    console.log('Compiled MobileModule dependency injection: OK');
  } finally {
    await context.close();
  }
}

check().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
