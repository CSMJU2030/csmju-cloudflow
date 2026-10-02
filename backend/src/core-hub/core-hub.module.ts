import { Global, Module } from '@nestjs/common';

import { CoreHubClient } from './core-hub.client';
import { CoreHubController } from './core-hub.controller';
import { PeopleService } from './people.service';
import { ReferenceDataService } from './reference-data.service';

@Global()
@Module({
  controllers: [CoreHubController],
  providers: [CoreHubClient, ReferenceDataService, PeopleService],
  exports: [CoreHubClient, ReferenceDataService, PeopleService],
})
export class CoreHubModule {}
